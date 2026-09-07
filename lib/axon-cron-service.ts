/**
 * AXON cron job service — NI-Brain state + GitHub Actions run metadata.
 *
 * BPA-FOLLOWUP-CRON-TAB-MINI-TOGGLE-0906 item 4: GitHub Actions *schedules* are
 * retired org-wide — every workflow this catalog points at (and every live roster
 * row it merges against) fires via `workflow_dispatch` only, never `on.schedule`.
 * The enable/disable-workflow toggle this file used to call
 * (`PUT /actions/workflows/{id}/{enable|disable}`) had nothing left to flip and is
 * removed. `fetchWorkflowRunMeta` below is unrelated and stays — it only *reads*
 * recent run history for display, it never toggles anything.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveGithubPat } from './github-pat.mjs';
import { plainMiniToggleNote } from './axon-v0/plain-labels';
import {
  AXON_CRON_CATALOG,
  type AxonCronJobView,
  type RosterRoutineRow,
  estimateNextRunUtcMulti,
  getCronJobDef,
  mergeCatalogWithRoster,
} from './axon-cron-jobs';

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

type CronRow = {
  id: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_summary: string | null;
  next_run_at: string | null;
  warnings: string[] | null;
  updated_at: string | null;
};

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

async function ghFetch(path: string, token: string, init?: RequestInit) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  return r;
}

async function fetchWorkflowRunMeta(
  repo: string,
  workflowFile: string,
  token: string,
): Promise<{ lastRunAt: string | null; lastRunStatus: string | null; lastRunSummary: string | null; running: boolean }> {
  const [owner, name] = repo.split('/');
  try {
    const wfRes = await ghFetch(
      `/repos/${owner}/${name}/actions/workflows/${encodeURIComponent(workflowFile)}`,
      token,
    );
    if (!wfRes.ok) {
      return {
        lastRunAt: null,
        lastRunStatus: null,
        lastRunSummary: `Workflow not found in ${repo}`,
        running: false,
      };
    }
    const wf = await wfRes.json();
    const runsRes = await ghFetch(`/repos/${owner}/${name}/actions/workflows/${wf.id}/runs?per_page=3`, token);
    if (!runsRes.ok) {
      return { lastRunAt: null, lastRunStatus: null, lastRunSummary: null, running: false };
    }
    const runsData = await runsRes.json();
    const runs = runsData.workflow_runs ?? [];
    const latest = runs[0];
    if (!latest) {
      return { lastRunAt: null, lastRunStatus: null, lastRunSummary: 'No runs yet', running: false };
    }
    const running = runs.some((run: { status: string }) => run.status === 'in_progress' || run.status === 'queued');
    return {
      lastRunAt: latest.updated_at ?? latest.run_started_at ?? null,
      lastRunStatus: latest.conclusion ?? latest.status ?? null,
      lastRunSummary: latest.display_title ?? latest.name ?? null,
      running,
    };
  } catch {
    return { lastRunAt: null, lastRunStatus: null, lastRunSummary: null, running: false };
  }
}

/**
 * BPA-FOLLOWUP-CRON-TAB-MINI-TOGGLE-0906 item 2 — for a roster row whose
 * `platform` is `nvg_mini`, the Cron tab toggle drives the roster's own `active`
 * flag (the thing the Mac mini's local scheduler actually reads) instead of a
 * GitHub Actions workflow, which that job was never scheduled through. Write-scoped
 * to exactly one row, one column.
 */
async function setRosterRoutineActive(routineId: string, active: boolean): Promise<string | null> {
  const sb = serviceClient();
  const { error } = await sb
    .from('nvg_agent_routines')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('routine_id', routineId);
  if (error) return `Roster update failed: ${error.message}`;
  return null;
}

export async function fetchCronJobRows(): Promise<Map<string, CronRow>> {
  const sb = serviceClient();
  const { data, error } = await sb.from('axon_cron_jobs').select('*');
  if (error) throw new Error(error.message);
  const map = new Map<string, CronRow>();
  for (const row of data ?? []) map.set(row.id, row as CronRow);
  return map;
}

/**
 * A3 — the roster IS the schedule truth. Reads `nvg_agent_routines` filtered to
 * `harness='mac_mini'` (read-only; nothing in this module ever writes that table).
 */
export async function fetchMacMiniRosterRows(): Promise<RosterRoutineRow[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('nvg_agent_routines')
    .select('routine_id, active, wake_type, wake_config, retired_at, platform')
    .eq('harness', 'mac_mini');
  if (error) throw new Error(error.message);
  return (data ?? []) as RosterRoutineRow[];
}

export async function listCronJobs(): Promise<AxonCronJobView[]> {
  const [rows, rosterRows] = await Promise.all([fetchCronJobRows(), fetchMacMiniRosterRows()]);
  const token = await resolveGithubPat();
  const merged = mergeCatalogWithRoster(AXON_CRON_CATALOG, rosterRows);

  const views = await Promise.all(
    merged.map(async (def) => {
      const row = rows.get(def.id);
      const enabled = row?.enabled ?? def.defaultEnabled;
      const scheduled = def.cronUtc.length > 0 && enabled && def.rosterActive !== false;

      let ghMeta = {
        lastRunAt: row?.last_run_at ?? null,
        lastRunStatus: row?.last_run_status ?? null,
        lastRunSummary: row?.last_run_summary ?? null,
        running: false,
      };

      if (token) {
        const live = await fetchWorkflowRunMeta(def.workflowRepo, def.workflowFile, token);
        ghMeta = {
          lastRunAt: live.lastRunAt ?? ghMeta.lastRunAt,
          lastRunStatus: live.lastRunStatus ?? ghMeta.lastRunStatus,
          lastRunSummary: live.lastRunSummary ?? ghMeta.lastRunSummary,
          running: live.running,
        };
      }

      const warnings = [...(row?.warnings ?? [])];
      if (!def.rosterMatched) {
        warnings.push('No matching NI-Brain roster row (nvg_agent_routines, harness=mac_mini) — schedule cannot be verified.');
      } else if (def.cronUtc.length === 0) {
        // BPA-FOLLOWUP-CRON-TAB-MINI-TOGGLE-0906 item 3: when the roster carries an
        // unparseable human schedule note (scheduleLabel says so), surface it as a
        // non-authoritative note rather than only the generic "no schedule" line.
        warnings.push(
          def.scheduleLabel.includes('roster note')
            ? `No machine-readable schedule in the roster — ${def.scheduleLabel}`
            : 'No active schedule in the roster — manual dispatch only.',
        );
      }
      if (!token) warnings.push('GitHub PAT missing — live run status unavailable.');

      const nextEstimate = estimateNextRunUtcMulti(def.cronUtc);
      const nextRunAt =
        scheduled && nextEstimate
          ? nextEstimate.toISOString()
          : row?.next_run_at ?? null;

      return {
        ...def,
        enabled,
        scheduled,
        running: scheduled && ghMeta.running,
        lastRunAt: ghMeta.lastRunAt,
        lastRunStatus: ghMeta.lastRunStatus,
        lastRunSummary: ghMeta.lastRunSummary,
        nextRunAt,
        toggleNote: plainMiniToggleNote(def.rosterPlatform),
        warnings: Array.from(new Set(warnings)),
      } satisfies AxonCronJobView;
    }),
  );

  return views;
}

export async function toggleCronJob(id: string, enabled: boolean): Promise<AxonCronJobView> {
  const def = getCronJobDef(id);
  if (!def) throw new Error('Unknown cron job');

  const warnings: string[] = [];

  const rosterRows = await fetchMacMiniRosterRows();
  const [merged] = mergeCatalogWithRoster([def], rosterRows);
  const hasSchedule = merged.cronUtc.length > 0;
  const isMiniRoster = merged.rosterPlatform === 'nvg_mini';

  if (isMiniRoster) {
    // BPA-FOLLOWUP-CRON-TAB-MINI-TOGGLE-0906 item 2: this job is not a GitHub
    // Actions schedule — it runs on the Mac mini and the roster's own `active`
    // column is what the mini's local scheduler actually reads. Flip that instead
    // of a GitHub Actions enable/disable call, which would touch nothing real.
    const routineId = def.rosterRoutineId ?? def.id;
    const rosterErr = merged.rosterMatched
      ? await setRosterRoutineActive(routineId, enabled)
      : 'No matching roster row — nothing to toggle on the Mac mini.';
    if (rosterErr) warnings.push(rosterErr);
  } else if (!merged.rosterMatched) {
    warnings.push('No matching NI-Brain roster row — saved preference only; nothing was toggled outside AXON.');
  } else if (!hasSchedule) {
    warnings.push('No live schedule for this job — saved preference only.');
  }

  const sb = serviceClient();
  const nextRun = enabled ? estimateNextRunUtcMulti(merged.cronUtc) : null;
  const { error } = await sb.from('axon_cron_jobs').upsert({
    id,
    enabled,
    next_run_at: nextRun?.toISOString() ?? null,
    warnings,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  const jobs = await listCronJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error('Cron job missing after toggle');
  return job;
}

/** Jobs that should render in Droid Space (enabled + scheduled). */
export async function listActiveDroidJobs(): Promise<AxonCronJobView[]> {
  const jobs = await listCronJobs();
  return jobs.filter((j) => j.scheduled);
}

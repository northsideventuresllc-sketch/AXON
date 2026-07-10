/**
 * AXON cron job service — NI-Brain state + GitHub Actions run metadata.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveGithubPat } from './github-pat.mjs';
import {
  AXON_CRON_CATALOG,
  type AxonCronJobView,
  estimateNextRunUtc,
  getCronJobDef,
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

async function setGithubWorkflowEnabled(
  repo: string,
  workflowFile: string,
  enabled: boolean,
  token: string,
): Promise<string | null> {
  const [owner, name] = repo.split('/');
  const wfRes = await ghFetch(
    `/repos/${owner}/${name}/actions/workflows/${encodeURIComponent(workflowFile)}`,
    token,
  );
  if (!wfRes.ok) return `Could not find workflow ${workflowFile} in ${repo}`;
  const wf = await wfRes.json();
  const action = enabled ? 'enable' : 'disable';
  const toggleRes = await ghFetch(
    `/repos/${owner}/${name}/actions/workflows/${wf.id}/${action}`,
    token,
    { method: 'PUT' },
  );
  if (!toggleRes.ok) return `GitHub ${action} failed: HTTP ${toggleRes.status}`;
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

export async function listCronJobs(): Promise<AxonCronJobView[]> {
  const rows = await fetchCronJobRows();
  const token = await resolveGithubPat();

  const views = await Promise.all(
    AXON_CRON_CATALOG.map(async (def) => {
      const row = rows.get(def.id);
      const enabled = row?.enabled ?? def.defaultEnabled;
      const scheduled = Boolean(def.cronUtc) && enabled;

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
      if (!def.cronUtc) warnings.push('No active schedule in workflow — manual dispatch only.');
      if (!token) warnings.push('GitHub PAT missing — live run status unavailable.');

      const nextEstimate = estimateNextRunUtc(def.cronUtc);
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
        warnings: Array.from(new Set(warnings)),
      } satisfies AxonCronJobView;
    }),
  );

  return views;
}

export async function toggleCronJob(id: string, enabled: boolean): Promise<AxonCronJobView> {
  const def = getCronJobDef(id);
  if (!def) throw new Error('Unknown cron job');

  const token = await resolveGithubPat();
  const warnings: string[] = [];

  if (token && def.cronUtc) {
    const ghErr = await setGithubWorkflowEnabled(def.workflowRepo, def.workflowFile, enabled, token);
    if (ghErr) warnings.push(ghErr);
  } else if (def.cronUtc && !token) {
    warnings.push('GitHub PAT missing — saved preference only; workflow schedule not toggled on GitHub.');
  }

  const sb = serviceClient();
  const nextRun = enabled ? estimateNextRunUtc(def.cronUtc) : null;
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

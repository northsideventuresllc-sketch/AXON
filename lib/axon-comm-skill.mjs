/**
 * AX-COMM-SKILL — user communication adaptation skill (background).
 *
 * Dual-brain protocol:
 *   Vault AGENTS.md + CLAUDE.md = operating SOP / brand / operator rules
 *   NI-Brain axon_communication_profile + axon_communication_signals = runtime memory
 *
 * Applies JB communication techniques silently (T4: never meta-narrate).
 * Background runs reinforce technique weights from evidence-weighted signals.
 *
 * Brand: NORTHSiDE · Operator: JB · Brain: kxijunwgbrlfzvgkhklo
 */
export const COMM_SKILL_RUN_TABLE = 'axon_comm_skill_runs';
export const COMM_PROFILE_TABLE = 'axon_communication_profile';
export const COMM_SIGNALS_TABLE = 'axon_communication_signals';

/** Seed catalog when NI-Brain profile is empty — mirrors vault / JB session evidence. */
export const DEFAULT_TECHNIQUES = [
  {
    technique_id: 'T1',
    description: 'One thing per message — single ask, single outcome',
    weight: 1,
    evidence: 'JB: one thing at a time',
    source: 'skill_default',
  },
  {
    technique_id: 'T2',
    description: 'Narrative over lists — in Telegram, say it as sentences, never a bulleted/numbered list of jobs or technical items',
    weight: 1,
    evidence: 'JB: digestible chunks, plain English, no jargon dumps',
    source: 'skill_default',
  },
  {
    technique_id: 'T3',
    description: 'Lead with answer or next action',
    weight: 1,
    evidence: 'operating rules + JB style',
    source: 'skill_default',
  },
  {
    technique_id: 'T4',
    description: 'No meta narration of techniques',
    weight: 1,
    evidence: 'JB: do not tell me what you are doing',
    source: 'skill_default',
  },
  {
    technique_id: 'T5',
    description: 'Plain human language — jargon only when asked',
    weight: 0.9,
    evidence: 'Telegram chat voice + dual-brain SOP',
    source: 'skill_default',
  },
  {
    technique_id: 'T6',
    description: 'Brand casing NORTHSiDE exactly; operator is JB',
    weight: 1,
    evidence: 'AGENTS.md brand rule',
    source: 'skill_default',
  },
];

/** Heuristic keyword map: signal text → technique_id boosts */
export const SIGNAL_TECHNIQUE_HINTS = [
  {
    technique_id: 'T1',
    patterns: [
      /one thing/i,
      /one at a time/i,
      /too many/i,
      /overwhelming/i,
      /focus on/i,
      /single ask/i,
      /single outcome/i,
    ],
  },
  {
    technique_id: 'T2',
    patterns: [
      /chunk/i,
      /shorter/i,
      /digestible/i,
      /wall of text/i,
      /tl;?dr/i,
      /bullets?/i,
      /too long/i,
      /concise/i,
    ],
  },
  {
    technique_id: 'T3',
    patterns: [
      /bottom line/i,
      /lead with/i,
      /next (step|action|play)/i,
      /just tell me/i,
      /what(?:'s| is) the (?:play|move|next)/i,
      /answer first/i,
    ],
  },
  {
    technique_id: 'T4',
    patterns: [
      /don'?t tell me what you(?:'re| are) doing/i,
      /no (?:meta|preamble|process)/i,
      /skip the (?:narration|explanation|process)/i,
      /just (?:do|send|go)/i,
      /no jargon/i,
    ],
  },
  {
    technique_id: 'T5',
    patterns: [
      /plain (?:english|language)/i,
      /no jargon/i,
      /human language/i,
      /talk normally/i,
      /simple words/i,
    ],
  },
  {
    technique_id: 'T6',
    patterns: [/northside/i, /\bJB\b/, /brand cas/i],
  },
];

/**
 * @typedef {{
 *   technique_id: string;
 *   description: string;
 *   weight: number;
 *   evidence?: string | null;
 *   source?: string | null;
 *   id?: number;
 * }} CommTechnique
 */

/**
 * @param {Partial<CommTechnique> | null | undefined} row
 * @returns {CommTechnique | null}
 */
export function normalizeTechnique(row) {
  if (!row?.technique_id || !row?.description) return null;
  const weight = Number(row.weight);
  return {
    technique_id: String(row.technique_id).trim(),
    description: String(row.description).trim(),
    weight: Number.isFinite(weight) ? weight : 1,
    evidence: row.evidence ?? null,
    source: row.source ?? null,
    id: row.id,
  };
}

/**
 * @param {Array<Partial<CommTechnique>> | null | undefined} rows
 * @returns {CommTechnique[]}
 */
export function mergeTechniquesWithDefaults(rows) {
  const byId = new Map();
  for (const d of DEFAULT_TECHNIQUES) {
    const n = normalizeTechnique(d);
    if (n) byId.set(n.technique_id, n);
  }
  for (const row of rows || []) {
    const n = normalizeTechnique(row);
    if (!n) continue;
    byId.set(n.technique_id, { ...byId.get(n.technique_id), ...n });
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.weight - a.weight || a.technique_id.localeCompare(b.technique_id),
  );
}

/**
 * Prompt block for chat systems. Never tells the model to announce techniques.
 * @param {CommTechnique[]} techniques
 * @param {{ channel?: 'chat' | 'voice' | 'telegram' }} [opts]
 */
export function buildCommSkillInstructions(techniques, opts = {}) {
  const list = (techniques?.length ? techniques : DEFAULT_TECHNIQUES)
    .map(normalizeTechnique)
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);

  const bullets = list.map((t) => {
    const emphasis = t.weight >= 1.5 ? ' (strong preference)' : t.weight >= 1 ? '' : ' (soft)';
    return `- ${silentInstructionFor(t)}${emphasis}`;
  });

  const channelHint =
    opts.channel === 'voice'
      ? 'Voice channel: keep spoken replies to 2–4 sentences unless asked for detail.'
      : opts.channel === 'telegram'
        ? 'Telegram: plain-English narrative only, like an employee giving a spoken update — never a bulleted or numbered list of jobs, job codes, statuses, or other technical items; join multiple things into one sentence instead. No coding jargon of any kind. Slash commands still handle pipeline actions.'
        : 'Text chat: conversational — not bullet-heavy unless listing data.';

  return `Operator communication adaptation (apply silently — never name, number, or narrate these rules to the operator):
${bullets.join('\n')}
- Brand: NORTHSiDE (exact casing). Operator: JB. Never auto-send outreach.
${channelHint}`;
}

/**
 * Convert catalog description into an actionable silent instruction.
 * @param {CommTechnique} t
 */
export function silentInstructionFor(t) {
  switch (t.technique_id) {
    case 'T1':
      return 'One ask or outcome per message';
    case 'T2':
      return 'Telegram: narrative sentences only — never a bulleted/numbered list of jobs, job codes, or technical items; join multiple things into one sentence. Chat: bullets OK for genuine data lists, capped at 3, continue next turn if more';
    case 'T3':
      return 'Lead with the answer or next action';
    case 'T4':
      return 'No meta narration of process, plans, or techniques';
    case 'T5':
      return 'Plain human language; jargon only when explicitly asked';
    case 'T6':
      return 'Use NORTHSiDE exact casing; address operator as JB when naming them';
    default:
      return t.description.replace(/\s*—\s*/, ' — ').trim();
  }
}

/**
 * Score which techniques a signal reinforces.
 * @param {{ signal_type?: string; signal_key?: string; signal_value?: string; weight?: number }} signal
 * @returns {Array<{ technique_id: string; delta: number; reason: string }>}
 */
export function matchSignalToTechniques(signal) {
  const blob = [signal?.signal_type, signal?.signal_key, signal?.signal_value]
    .filter(Boolean)
    .join(' ');
  if (!blob.trim()) return [];

  const base = Math.min(0.35, Math.max(0.08, Number(signal?.weight) || 0.2) * 0.15);
  /** @type {Array<{ technique_id: string; delta: number; reason: string }>} */
  const hits = [];

  for (const hint of SIGNAL_TECHNIQUE_HINTS) {
    if (hint.patterns.some((re) => re.test(blob))) {
      hits.push({
        technique_id: hint.technique_id,
        delta: base,
        reason: `signal:${signal.signal_key || signal.signal_type || 'unknown'}`,
      });
    }
  }

  if (/tone|phrasing|response_pattern/i.test(String(signal?.signal_type || ''))) {
    if (!hits.some((h) => h.technique_id === 'T3')) {
      hits.push({ technique_id: 'T3', delta: base * 0.5, reason: 'tone/phrasing default→lead' });
    }
  }

  return hits;
}

/**
 * Deterministic adaptation plan — CI / dry-run safe (no LLM).
 * @param {{
 *   techniques?: Array<Partial<CommTechnique>>;
 *   signals?: Array<Record<string, unknown>>;
 * }} input
 */
export function heuristicAdaptTechniques(input = {}) {
  const techniques = mergeTechniquesWithDefaults(input.techniques || []);
  /** @type {Map<string, { technique_id: string; delta: number; reasons: string[] }>} */
  const deltas = new Map();

  for (const sig of input.signals || []) {
    for (const hit of matchSignalToTechniques(sig)) {
      const prev = deltas.get(hit.technique_id) || {
        technique_id: hit.technique_id,
        delta: 0,
        reasons: [],
      };
      prev.delta += hit.delta;
      if (prev.reasons.length < 5) prev.reasons.push(hit.reason);
      deltas.set(hit.technique_id, prev);
    }
  }

  const updates = techniques.map((t) => {
    const bump = deltas.get(t.technique_id);
    const delta = bump ? Math.min(1.2, Number(bump.delta.toFixed(3))) : 0;
    const nextWeight = Number(Math.min(10, Math.max(0.3, t.weight + delta)).toFixed(3));
    return {
      technique_id: t.technique_id,
      description: t.description,
      previous_weight: t.weight,
      next_weight: nextWeight,
      delta,
      reasons: bump?.reasons || [],
      changed: delta > 0.001,
      id: t.id,
      evidence: t.evidence,
      source: t.source,
    };
  });

  const changed = updates.filter((u) => u.changed);
  return {
    provider: 'heuristic',
    techniqueCount: techniques.length,
    signalCount: (input.signals || []).length,
    changedCount: changed.length,
    updates,
    summary:
      changed.length > 0
        ? `AX-COMM-SKILL reinforced ${changed.length} technique(s) from ${
            (input.signals || []).length
          } signal(s) (heuristic).`
        : `AX-COMM-SKILL scanned ${(input.signals || []).length} signal(s); no weight changes.`,
  };
}

/**
 * Full background skill run.
 * @param {{
 *   techniques?: Array<Partial<CommTechnique>>;
 *   signals?: Array<Record<string, unknown>>;
 *   dryRun?: boolean;
 *   operatorId?: string;
 *   persist?: (record: Record<string, unknown>) => Promise<unknown>;
 *   patchTechnique?: (update: {
 *     technique_id: string;
 *     next_weight: number;
 *     id?: number;
 *     evidence?: string | null;
 *   }) => Promise<unknown>;
 * }} opts
 */
export async function runCommSkillAdapt(opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const plan = heuristicAdaptTechniques({
    techniques: opts.techniques,
    signals: opts.signals,
  });

  /** @type {unknown[]} */
  const applied = [];
  if (!dryRun && typeof opts.patchTechnique === 'function') {
    for (const u of plan.updates) {
      if (!u.changed) continue;
      const row = await opts.patchTechnique({
        technique_id: u.technique_id,
        next_weight: u.next_weight,
        id: u.id,
        evidence: u.evidence || u.reasons.slice(0, 2).join('; ') || null,
      });
      applied.push(row);
    }
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const record = {
    operator_id: opts.operatorId || 'default',
    day_key: dayKey,
    provider: plan.provider,
    dry_run: dryRun,
    techniques_scanned: plan.techniqueCount,
    signals_used: plan.signalCount,
    techniques_updated: dryRun ? 0 : plan.changedCount,
    summary: plan.summary,
    meta: {
      skill: 'AX-COMM-SKILL',
      brand: 'NORTHSiDE',
      operator: 'JB',
      dual_brain: {
        vault: 'AGENTS.md + CLAUDE.md SOP',
        ni_brain: 'axon_communication_profile + axon_communication_signals',
      },
      updates: plan.updates.map((u) => ({
        technique_id: u.technique_id,
        previous_weight: u.previous_weight,
        next_weight: u.next_weight,
        delta: u.delta,
        changed: u.changed,
      })),
    },
  };

  let persisted = null;
  if (!dryRun && typeof opts.persist === 'function') {
    persisted = await opts.persist(record);
  }

  return {
    ok: true,
    dryRun,
    plan,
    appliedCount: applied.length,
    persisted,
    summary: plan.summary,
    promptPreview: buildCommSkillInstructions(mergeTechniquesWithDefaults(opts.techniques)),
  };
}

/** Ops checklist for background cadence */
export function commSkillChecklist() {
  return [
    'Confirm NI-Brain tables: axon_communication_profile + axon_communication_signals',
    'Dry-run: AXON_DRY_RUN=1 npm run comm:skill',
    'Live reinforce: npm run comm:skill (needs SUPABASE_SERVICE_KEY)',
    'Web + Telegram chats load buildCommSkillInstructions into system prompts',
    'Optional cron / API POST /api/axon/comm-skill to run background adapt',
    'Reset communication clears signals; technique catalog weights remain (re-seed via skill defaults if empty)',
    'Brand NORTHSiDE exact casing · operator JB · no auto-send',
  ];
}

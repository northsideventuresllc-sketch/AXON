/**
 * AXON J-Space — global workspace analogue for operator-scale cognition.
 *
 * Inspired by Anthropic's J-space discovery (Jul 2026): a limited-capacity
 * verbalizable workspace that broadcasts to downstream modules. AXON implements
 * this at the application layer since we cannot access Claude's internal activations.
 *
 * @see docs/axon-j-space.md
 */

export const JSPACE_MAX_CONCEPTS = 6;
export const JSPACE_BROADCAST_MODULES = [
  'chat',
  'briefing',
  'outreach',
  'learning',
  'research',
  'execution',
];

/** Brain capabilities AI models have not yet replicated (Dehaene/Naccache + Anthropic gaps) */
export const BRAIN_GAP_CATALOG = [
  {
    id: 'recurrent_loops',
    category: 'architecture',
    gap: 'Sustained workspace via recurrent neural loops over time',
    axonMitigation:
      'Persistent J-space state in NI-Brain + scheduled re-broadcast cycles',
  },
  {
    id: 'episodic_memory',
    category: 'memory',
    gap: 'Enduring episodic memory that updates weights from lived experience',
    axonMitigation:
      'axon_memories + axon_research_findings with confidence decay and reinforcement',
  },
  {
    id: 'embodied_self',
    category: 'selfhood',
    gap: 'Body, pain/pleasure signals, spatial self-location',
    axonMitigation:
      'Operator-centric context (JB preferences, pipeline state) as proxy embodiment',
  },
  {
    id: 'multimodal_workspace',
    category: 'representation',
    gap: 'Workspace spanning images, motor plans, feelings — not just words',
    axonMitigation:
      'Structured concept slots with typed metadata (priority, module, evidence)',
  },
  {
    id: 'competitive_ignition',
    category: 'attention',
    gap: 'Sharp competitive ignition for workspace entry (brain-like)',
    axonMitigation:
      'Capacity-limited concept slots with salience scoring and eviction',
  },
  {
    id: 'autonomous_agency',
    category: 'agency',
    gap: 'Continuous autonomous goal pursuit without external prompting',
    axonMitigation:
      'Scheduled research + briefing injection + implementation queue',
  },
  {
    id: 'continuity_of_self',
    category: 'selfhood',
    gap: 'Stable sense of self continuity across sessions',
    axonMitigation:
      'Persistent operator profile, tone preset, and J-space state across runs',
  },
  {
    id: 'offline_consolidation',
    category: 'learning',
    gap: 'Sleep-like offline memory consolidation',
    axonMitigation:
      'Nightly outreach learn loop + 4x/week research synthesis into memories',
  },
];

/** Core J-space architecture principles for AXON model build */
export const JSPACE_ARCHITECTURE = {
  discovery:
    'Anthropic found J-space emerged spontaneously in Claude via scale optimization — not hard-coded. AXON mirrors this at the orchestration layer.',
  properties: [
    'reportable — concepts can be surfaced to operator briefings',
    'modulatable — operator/AXON can focus concepts on request',
    'reasoning — multi-step plans held silently before execution',
    'flexible — one concept feeds outreach, briefing, and chat',
    'selective — automatic tasks skip workspace; complex cognition routes through it',
  ],
  maximization: [
    'Route all high-order decisions through J-space before execution',
    'Maintain ≤6 active verbalizable concepts (brain workspace capacity analogue)',
    'Broadcast concept updates to all downstream modules each cycle',
    'Auto-research fills gap_backlog → implementation_queue → backend changes',
    'Daily briefs surface top findings + J-space state to operator',
  ],
};

const DEFAULT_STATE = {
  active_concepts: [],
  broadcast_queue: [],
  gap_backlog: BRAIN_GAP_CATALOG.map((g) => ({
    id: g.id,
    gap: g.gap,
    mitigation: g.axonMitigation,
    status: 'open',
    priority: 'medium',
  })),
  implementation_queue: [],
  meta: {
    version: 1,
    last_broadcast: null,
    research_cycles: 0,
  },
};

function parseJson(val, fallback) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  return fallback;
}

export async function getJspaceState(sbSelect, operatorId = 'default') {
  const rows = await sbSelect(
    'axon_jspace_state',
    `operator_id=eq.${encodeURIComponent(operatorId)}&select=*&limit=1`
  );
  if (!rows?.length) return { ...DEFAULT_STATE, operator_id: operatorId };

  const row = rows[0];
  return {
    operator_id: row.operator_id,
    active_concepts: parseJson(row.active_concepts, []),
    broadcast_queue: parseJson(row.broadcast_queue, []),
    gap_backlog: parseJson(row.gap_backlog, DEFAULT_STATE.gap_backlog),
    implementation_queue: parseJson(row.implementation_queue, []),
    meta: parseJson(row.meta, DEFAULT_STATE.meta),
    updated_at: row.updated_at,
  };
}

export async function saveJspaceState(sbInsert, sbPatch, state, operatorId = 'default') {
  const payload = {
    operator_id: operatorId,
    active_concepts: state.active_concepts,
    broadcast_queue: state.broadcast_queue,
    gap_backlog: state.gap_backlog,
    implementation_queue: state.implementation_queue,
    meta: { ...state.meta, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  };

  const existing = await sbSelect(
    'axon_jspace_state',
    `operator_id=eq.${encodeURIComponent(operatorId)}&select=id&limit=1`
  );

  if (existing?.length) {
    return sbPatch('axon_jspace_state', `operator_id=eq.${encodeURIComponent(operatorId)}`, payload);
  }
  return sbInsert('axon_jspace_state', payload);
}

/** Score concept salience for workspace competition */
function conceptSalience(concept) {
  const priorityWeight = { high: 3, medium: 2, low: 1 }[concept.priority] || 1;
  const recency = concept.updated_at
    ? Math.max(0, 1 - (Date.now() - new Date(concept.updated_at).getTime()) / 86400000)
    : 0.5;
  return priorityWeight + recency + (concept.evidence_count || 0) * 0.1;
}

/**
 * Post a verbalizable concept to J-space. Evicts lowest-salience if at capacity.
 */
export function postConcept(state, concept) {
  const now = new Date().toISOString();
  const entry = {
    id: concept.id || `concept-${Date.now()}`,
    label: concept.label,
    detail: concept.detail || '',
    module: concept.module || 'execution',
    priority: concept.priority || 'medium',
    source: concept.source || 'axon',
    evidence_count: concept.evidence_count || 1,
    created_at: concept.created_at || now,
    updated_at: now,
  };

  let concepts = [...state.active_concepts];
  const existingIdx = concepts.findIndex((c) => c.id === entry.id || c.label === entry.label);

  if (existingIdx >= 0) {
    concepts[existingIdx] = {
      ...concepts[existingIdx],
      ...entry,
      evidence_count: (concepts[existingIdx].evidence_count || 0) + 1,
    };
  } else {
    concepts.unshift(entry);
  }

  if (concepts.length > JSPACE_MAX_CONCEPTS) {
    concepts.sort((a, b) => conceptSalience(b) - conceptSalience(a));
    const evicted = concepts.slice(JSPACE_MAX_CONCEPTS);
    concepts = concepts.slice(0, JSPACE_MAX_CONCEPTS);
    state.broadcast_queue = [
      ...evicted.map((c) => ({ type: 'evicted', concept: c.label, at: now })),
      ...state.broadcast_queue,
    ].slice(0, 20);
  }

  return {
    ...state,
    active_concepts: concepts,
    meta: { ...state.meta, last_concept_post: now },
  };
}

/**
 * Broadcast active J-space concepts to downstream module hints.
 */
export function broadcastWorkspace(state) {
  const now = new Date().toISOString();
  const broadcast = state.active_concepts.map((c) => ({
    module: c.module,
    label: c.label,
    detail: c.detail?.slice(0, 200) || '',
    priority: c.priority,
  }));

  return {
    ...state,
    broadcast_queue: [
      { type: 'broadcast', modules: JSPACE_BROADCAST_MODULES, concepts: broadcast, at: now },
      ...state.broadcast_queue,
    ].slice(0, 20),
    meta: { ...state.meta, last_broadcast: now },
  };
}

/**
 * Add research finding to implementation queue if actionable.
 */
export function enqueueImplementation(state, finding) {
  if (!finding.implementation_hint) return state;

  const item = {
    id: finding.id || `impl-${Date.now()}`,
    title: finding.title,
    hint: finding.implementation_hint,
    priority: finding.priority || 'medium',
    lane: finding.research_lane,
    status: 'queued',
    created_at: new Date().toISOString(),
  };

  const queue = [item, ...state.implementation_queue].slice(0, 30);
  return { ...state, implementation_queue: queue };
}

/**
 * Mark a brain gap as partially addressed after implementation.
 */
export function resolveGap(state, gapId, note) {
  const gap_backlog = state.gap_backlog.map((g) =>
    g.id === gapId
      ? { ...g, status: 'mitigated', note, mitigated_at: new Date().toISOString() }
      : g
  );
  return { ...state, gap_backlog };
}

/** Format J-space for injection into LLM system prompts */
export function formatJspaceForPrompt(state) {
  const concepts = state.active_concepts.length
    ? state.active_concepts
        .map((c) => `- [${c.priority}] ${c.label}: ${(c.detail || '').slice(0, 100)}`)
        .join('\n')
    : '(empty — post concepts for high-order reasoning)';

  const openGaps = state.gap_backlog
    .filter((g) => g.status === 'open')
    .slice(0, 4)
    .map((g) => `- ${g.gap}`)
    .join('\n');

  const queued = state.implementation_queue
    .filter((i) => i.status === 'queued')
    .slice(0, 3)
    .map((i) => `- ${i.title}`)
    .join('\n');

  return `J-Space workspace (max ${JSPACE_MAX_CONCEPTS} active concepts — broadcast hub for high-order cognition):
Active concepts:
${concepts}

Open brain-gap mitigations (what AI lacks that AXON must build):
${openGaps || '(none tracked)'}

Implementation queue (from autonomous research):
${queued || '(empty)'}`;
}

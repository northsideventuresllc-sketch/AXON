'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import './router-decision-panel.css';

interface Candidate {
  lane_id: string;
  model: string;
  route: string;
  score: number;
  reasons: string[];
}

interface Decision {
  id: string;
  capability_class: string;
  candidates: Candidate[];
  chosen_lane_id: string;
  chosen_reason: string;
  fell_through_from: { lane_id: string; error: string }[] | null;
  created_at: string;
}

const CLASS_LABEL: Record<string, string> = {
  cheap_chat: 'a quick question',
  long_context: 'a long-context request',
  code_build: 'a coding request',
  reasoning_planning: 'a reasoning question',
  vision: 'something with images',
  tool_use_agentic: 'a job needing tools',
  computer_use: 'a computer-use task',
};

/** Plain-English translation for the raw reason tokens scoreLanes() writes. Never show these raw. */
function translateReason(raw: string): string {
  if (raw.startsWith('capability match:')) return 'a good fit for this kind of task';
  if (raw === 'general lane, capabilities unclassified') return 'a general-purpose model';
  if (raw === 'health: healthy') return 'healthy';
  if (raw === 'health: degraded') return 'a bit shaky lately';
  if (raw === 'health: circuit_open') return 'recently had problems';
  if (raw === 'health: unknown') return 'not tested yet';
  if (raw.startsWith('free (')) return 'free';
  if (raw.startsWith('metered, cost tier')) return 'a paid option';
  if (raw.startsWith('quota remaining')) return 'running low on quota';
  if (raw === 'paid safety net — sorts last by design') return 'a paid backup, used last on purpose';
  if (raw === 'pinned by the operator') return 'manually pinned by JB';
  return raw;
}

/** Plain-English translation for a fall-through error string. Backend errors are free text, so this is heuristic. */
function translateError(raw: string): string {
  const s = (raw || '').toLowerCase();
  if (s.includes('circuit') || s.includes('breaker')) return 'that model is having problems';
  if (s.includes('quota') || s.includes('429') || s.includes('rate limit')) return 'that model hit its usage limit';
  if (s.includes('timeout') || s.includes('timed out')) return 'that model took too long to respond';
  if (s.includes('auth') || s.includes('401') || s.includes('403')) return 'that model rejected the request';
  if (s.includes('no lanes') || s.includes('unavailable')) return "that model wasn't available";
  return 'that model ran into a problem';
}

function friendlyLane(c: Candidate | undefined): string {
  if (!c) return 'a model';
  return `${c.route} — ${c.model}`;
}

function plainPickedLine(decision: Decision): string {
  const chosen = decision.candidates.find((c) => c.lane_id === decision.chosen_lane_id);
  const topReasons = (chosen?.reasons || []).map(translateReason).filter((r, i, a) => a.indexOf(r) === i).slice(0, 2);
  const prefix = decision.fell_through_from?.length ? 'That model was unavailable, so it picked' : 'Picked';
  const why = topReasons.length ? ` — ${topReasons.join(', ')}` : '';
  return `${prefix} ${friendlyLane(chosen)}${why}.`;
}

/** One row in the live/finished progress feed: a plain line + an opt-in technical detail line. */
interface FeedStep {
  key: string;
  plain: string;
  technical: string;
  tone: 'active' | 'ok' | 'fail' | 'info';
}

function stepsFromDecision(decision: Decision): FeedStep[] {
  const steps: FeedStep[] = [
    {
      key: 'classify',
      plain: `Working out what kind of question this is — looks like ${CLASS_LABEL[decision.capability_class] || decision.capability_class}.`,
      technical: `classify → capability: ${decision.capability_class}`,
      tone: 'info',
    },
  ];
  for (const f of decision.fell_through_from || []) {
    steps.push({
      key: `fell-${f.lane_id}`,
      plain: `${translateError(f.error)}, trying the next one.`,
      technical: `lane: ${f.lane_id} · error: ${String(f.error || '').slice(0, 160)}`,
      tone: 'fail',
    });
  }
  const chosen = decision.candidates.find((c) => c.lane_id === decision.chosen_lane_id);
  steps.push({
    key: 'chosen',
    plain: plainPickedLine(decision),
    technical: `lane: ${decision.chosen_lane_id}${chosen ? ` · score ${chosen.score.toFixed(2)}` : ''}`,
    tone: 'ok',
  });
  return steps;
}

const THINKING_STAGES: FeedStep[] = [
  { key: 'think-1', plain: 'Reading the message…', technical: 'stage: receive', tone: 'active' },
  { key: 'think-2', plain: 'Working out what kind of question this is…', technical: 'stage: classify', tone: 'active' },
  { key: 'think-3', plain: 'Checking which model can handle it…', technical: 'stage: score_lanes', tone: 'active' },
  { key: 'think-4', plain: 'Waiting on a reply…', technical: 'stage: execute', tone: 'active' },
];

const POLL_MS = 700;
const TIMEOUT_MS = 30000;
const REVEAL_STAGGER_MS = 380;

/**
 * "What AXON is doing, and why" — a live progress feed for the routing decision behind the
 * agent's current reply. Two registers per line: a plain-English sentence anyone can read
 * (default, visible), and a monospace technical line underneath (opt-in, collapsible).
 *
 * Transport: short-interval polling of GET /api/axon-v0/router/decisions, not SSE. The router
 * only writes one row per request, at the very end (see lib/axon-router-core.mjs routeChat) —
 * there is no partial/mid-flight row to stream today, so "live" here means: poll fast while a
 * reply is in flight, and reveal the real steps (classify → fall-throughs → chosen lane) one at
 * a time client-side the moment the row lands, instead of dumping it all at once. If another
 * agent later makes the router write progressive rows, this same polling loop picks them up
 * with no changes needed here.
 *
 * `sending` is optional and should be passed true while a request is in flight (the caller's
 * own loading state) to drive the live "thinking" animation and fast polling; without it the
 * panel falls back to its old behavior — fetch once per `agentId`/`refreshKey` change and show
 * the last completed decision.
 */
export function RouterDecisionPanel({
  agentId,
  refreshKey,
  sending = false,
}: {
  agentId: string | null;
  refreshKey?: unknown;
  sending?: boolean;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [open, setOpen] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'working' | 'revealing' | 'done' | 'timeout'>('idle');
  const [revealed, setRevealed] = useState<FeedStep[]>([]);
  const [thinkingIdx, setThinkingIdx] = useState(0);

  const lastSeenIdRef = useRef<string | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  async function fetchLatest(): Promise<Decision | null> {
    if (!agentId) return null;
    try {
      const r = await fetch(apiUrl(`/api/axon-v0/router/decisions?agentId=${agentId}&limit=1`));
      const d = await r.json();
      return (d.decisions || [])[0] || null;
    } catch {
      return null;
    }
  }

  // Plain fetch-on-change — preserves old behavior when the caller doesn't pass `sending`.
  useEffect(() => {
    if (!agentId) {
      setDecision(null);
      setLoaded(true);
      return;
    }
    let alive = true;
    fetchLatest().then((d) => {
      if (!alive) return;
      setDecision(d);
      if (d) lastSeenIdRef.current = d.id;
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, refreshKey]);

  // Live progress: fast-poll and reveal steps while a reply is in flight.
  useEffect(() => {
    if (!sending || !agentId) return;
    let alive = true;
    clearTimers();
    setPhase('working');
    setRevealed([]);
    setThinkingIdx(0);

    const thinkTimer = setInterval(() => {
      setThinkingIdx((i) => Math.min(i + 1, THINKING_STAGES.length - 1));
    }, 900);

    const startedAt = Date.now();
    const poll = setInterval(async () => {
      if (!alive) return;
      const d = await fetchLatest();
      if (!alive) return;
      if (d && d.id !== lastSeenIdRef.current) {
        lastSeenIdRef.current = d.id;
        setDecision(d);
        clearInterval(poll);
        clearInterval(thinkTimer);
        setPhase('revealing');
        const steps = stepsFromDecision(d);
        steps.forEach((step, i) => {
          const t = setTimeout(() => {
            setRevealed((prev) => [...prev, step]);
            if (i === steps.length - 1) setPhase('done');
          }, i * REVEAL_STAGGER_MS);
          timersRef.current.push(t);
        });
        return;
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        clearInterval(poll);
        clearInterval(thinkTimer);
        setPhase('timeout');
      }
    }, POLL_MS);

    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(thinkTimer);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending, agentId]);

  // Once sending flips back off without ever resolving, don't leave a stuck "working" state.
  useEffect(() => {
    if (!sending && phase === 'working') setPhase('idle');
  }, [sending, phase]);

  if (phase === 'working' || phase === 'revealing' || phase === 'timeout') {
    const liveSteps = phase === 'working' ? THINKING_STAGES.slice(0, thinkingIdx + 1) : revealed;
    return (
      <div className="rdp-strip rdp-live">
        <div className="rdp-live-feed">
          {liveSteps.map((s, i) => (
            <div key={s.key} className={`rdp-feed-row rdp-tone-${s.tone}`}>
              <span className="rdp-feed-plain">{s.plain}</span>
              {showTech && <span className="rdp-feed-tech">{s.technical}</span>}
              {phase === 'working' && i === liveSteps.length - 1 && <span className="rdp-pulse" aria-hidden />}
            </div>
          ))}
          {phase === 'timeout' && (
            <div className="rdp-feed-row rdp-tone-fail">
              <span className="rdp-feed-plain">Taking longer than expected — no routing update came back in time.</span>
            </div>
          )}
        </div>
        <button type="button" className="rdp-tech-toggle" onClick={() => setShowTech((v) => !v)}>
          {showTech ? 'Hide Detail' : 'Show Detail'}
        </button>
      </div>
    );
  }

  if (!loaded || !decision) return null;

  const doneSteps = phase === 'done' ? revealed : null;

  return (
    <div className="rdp-strip">
      <button type="button" className="rdp-head" onClick={() => setOpen((v) => !v)}>
        <span className="rdp-head-left">
          <span className="rdp-class">{CLASS_LABEL[decision.capability_class] || decision.capability_class}</span>
          <span className="rdp-reason">{doneSteps ? plainPickedLine(decision) : decision.chosen_reason}</span>
        </span>
        <span className={`rdp-caret ${open ? 'rdp-caret-open' : ''}`} aria-hidden>
          ▶
        </span>
      </button>
      {open && (
        <div className="rdp-body">
          {decision.candidates.length === 0 && <p className="rdp-empty">No ranked candidates recorded.</p>}
          {decision.candidates.map((c) => (
            <div
              key={c.lane_id}
              className={`rdp-candidate ${c.lane_id === decision.chosen_lane_id ? 'rdp-candidate-chosen' : ''}`}
            >
              <div className="rdp-candidate-left">
                <span className="rdp-candidate-name">
                  {c.route} · {c.model}
                </span>
                <span className="rdp-candidate-why">{c.reasons.map(translateReason).join(', ')}</span>
              </div>
              <span className="rdp-candidate-score">{c.score.toFixed(2)}</span>
            </div>
          ))}
          {decision.fell_through_from && decision.fell_through_from.length > 0 && (
            <p className="rdp-empty">
              Fell through {decision.fell_through_from.length} lane(s) before landing here.
            </p>
          )}
          <button type="button" className="rdp-tech-toggle" onClick={() => setShowTech((v) => !v)}>
            {showTech ? 'Hide Detail' : 'Show Detail'}
          </button>
          {showTech && (
            <pre className="rdp-feed-tech rdp-tech-block">
              {`capability_class: ${decision.capability_class}\nchosen_lane_id: ${decision.chosen_lane_id}\nchosen_reason: ${decision.chosen_reason}`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default RouterDecisionPanel;

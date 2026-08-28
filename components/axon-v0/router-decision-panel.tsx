'use client';

import { useEffect, useState } from 'react';
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
  cheap_chat: 'Quick chat',
  long_context: 'Long context',
  code_build: 'Code & build',
  reasoning_planning: 'Reasoning & planning',
  vision: 'Vision',
  tool_use_agentic: 'Tool use',
  computer_use: 'Computer use',
};

/**
 * "What AXON is doing, and why" — a small collapsible strip showing the latest routing
 * decision for the agent this chat is talking to. Refetches whenever a new reply lands
 * (bump `refreshKey`).
 */
export function RouterDecisionPanel({ agentId, refreshKey }: { agentId: string | null; refreshKey?: unknown }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setDecision(null);
      setLoaded(true);
      return;
    }
    let alive = true;
    fetch(apiUrl(`/api/axon-v0/router/decisions?agentId=${agentId}&limit=1`))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setDecision((d.decisions || [])[0] || null);
      })
      .catch(() => {
        if (alive) setDecision(null);
      })
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, refreshKey]);

  if (!loaded || !decision) return null;

  return (
    <div className="rdp-strip">
      <button type="button" className="rdp-head" onClick={() => setOpen((v) => !v)}>
        <span className="rdp-head-left">
          <span className="rdp-class">{CLASS_LABEL[decision.capability_class] || decision.capability_class}</span>
          <span className="rdp-reason">{decision.chosen_reason}</span>
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
                <span className="rdp-candidate-why">{c.reasons.join(', ')}</span>
              </div>
              <span className="rdp-candidate-score">{c.score.toFixed(2)}</span>
            </div>
          ))}
          {decision.fell_through_from && decision.fell_through_from.length > 0 && (
            <p className="rdp-empty">
              Fell through {decision.fell_through_from.length} lane(s) before landing here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default RouterDecisionPanel;

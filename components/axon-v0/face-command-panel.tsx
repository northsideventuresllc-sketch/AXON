'use client';

/**
 * THE FACE — the panels a voice command puts in the module list's place (step 3).
 *
 * One command changes exactly one panel, and this is the panel it changes. It sits where
 * the module list sits, carries a Back micro-label, and goes away again on "show agents".
 *
 * Both panels hold the same house rule as the stat cards: a source that could not be read
 * says so in a written sentence. It never becomes an empty list, because an empty list here
 * would read as "nothing to do" — a claim nobody checked.
 */
import type { FaceDayPlan, FaceNeedsMe } from '@/lib/axon-v0/face-plan-reads';

export interface FaceCommandPanelProps {
  panel: 'plan' | 'needs-me';
  plan: FaceDayPlan | null;
  needsMe: FaceNeedsMe | null;
  onBack: () => void;
}

function PanelShell({
  label,
  caption,
  onBack,
  children,
}: {
  label: string;
  caption?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="face-card face-modules face-command-panel">
      <span className="face-card-bracket face-card-bracket--tl" aria-hidden />
      <span className="face-card-bracket face-card-bracket--br" aria-hidden />

      <div className="face-command-head">
        <p className="face-micro face-card-label">{label}</p>
        <button type="button" className="face-micro face-command-back" onClick={onBack}>
          Back
        </button>
      </div>

      {caption ? <p className="face-card-caption face-command-caption">{caption}</p> : null}
      {children}
    </section>
  );
}

function PlanPanel({ plan, onBack }: { plan: FaceDayPlan | null; onBack: () => void }) {
  if (!plan) {
    return (
      <PanelShell label="Today’s Plan" onBack={onBack}>
        <p className="face-card-empty">Reading…</p>
      </PanelShell>
    );
  }

  if (!plan.readable) {
    return (
      <PanelShell label="Today’s Plan" onBack={onBack}>
        <p className="face-card-empty">Not answering</p>
        <p className="face-card-caption">
          The day plan could not be read just now. Nothing else on this screen depends on it.
        </p>
      </PanelShell>
    );
  }

  if (!plan.items.length) {
    return (
      <PanelShell label="Today’s Plan" onBack={onBack}>
        <p className="face-card-empty">No plan posted yet today</p>
        <p className="face-card-caption">
          The executive agent writes the day’s plan once it has run. It is not there yet, so
          there is nothing to show — this is an empty day, not a broken screen.
        </p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      label="Today’s Plan"
      caption={
        plan.source === 'exec-note'
          ? `From the executive agent’s own session note for ${plan.date ?? 'today'}.`
          : `Posted by the executive agent for ${plan.date ?? 'today'}, in its own words.`
      }
      onBack={onBack}
    >
      <ol className="face-command-list">
        {plan.items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`} className="face-command-item">
            <span className="face-micro face-command-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="face-command-text">{item}</span>
          </li>
        ))}
      </ol>
    </PanelShell>
  );
}

function NeedsMePanel({ needsMe, onBack }: { needsMe: FaceNeedsMe | null; onBack: () => void }) {
  if (!needsMe) {
    return (
      <PanelShell label="Waiting On You" onBack={onBack}>
        <p className="face-card-empty">Reading…</p>
      </PanelShell>
    );
  }

  if (!needsMe.readable) {
    return (
      <PanelShell label="Waiting On You" onBack={onBack}>
        <p className="face-card-empty">Not answering</p>
        <p className="face-card-caption">
          The queue could not be read just now, so this list is not a count of nothing — it is
          a read that did not land.
        </p>
      </PanelShell>
    );
  }

  if (!needsMe.items.length) {
    return (
      <PanelShell label="Waiting On You" onBack={onBack}>
        <p className="face-card-empty">Nothing is waiting on you</p>
        <p className="face-card-caption">Every job in the queue is with an agent, not with you.</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      label="Waiting On You"
      caption="Jobs parked until you say yes. Nothing here can be approved from this screen — approvals stay on your phone."
      onBack={onBack}
    >
      <ul className="face-command-list">
        {needsMe.items.map((item, index) => (
          <li key={`${index}-${item.what.slice(0, 24)}`} className="face-command-item">
            <span className="face-micro face-command-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="face-command-text">
              {item.what}
              {item.owner ? <span className="face-command-owner"> — {item.owner}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

export function FaceCommandPanel({ panel, plan, needsMe, onBack }: FaceCommandPanelProps) {
  return panel === 'plan' ? (
    <PlanPanel plan={plan} onBack={onBack} />
  ) : (
    <NeedsMePanel needsMe={needsMe} onBack={onBack} />
  );
}

export default FaceCommandPanel;

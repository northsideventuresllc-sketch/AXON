'use client';

/**
 * THE FACE — the per-agent activity trail (Build Plan B, step 4).
 *
 * Sits right of the orb on a wide screen and below everything else on a narrow one (see
 * `.face-activity` in face.css). Newest first, one line per bus event: the agent's name,
 * a plain-English verb read off the subject, a relative time, and a small dot that
 * brightens for anything under two minutes old.
 *
 * **Never a raw table name, id or code.** Only `verb`, `from` and `relative` are rendered —
 * the raw `subject` the API also carries is for the shaping layer and future refinement,
 * never for this screen.
 *
 * `aria-live="polite"` on the list so a screen reader hears new activity without it
 * interrupting whatever else is being read.
 */
import type { FaceActivityItem } from '@/lib/axon-v0/face-activity-reads';

export interface FaceActivityTrailProps {
  items: FaceActivityItem[];
  loading?: boolean;
  /** False when the bus itself could not be read at all — a different sentence from "quiet". */
  readable?: boolean;
}

export function FaceActivityTrail({ items, loading = false, readable = true }: FaceActivityTrailProps) {
  return (
    <section className="face-card face-activity">
      <span className="face-card-bracket face-card-bracket--tl" aria-hidden />
      <span className="face-card-bracket face-card-bracket--br" aria-hidden />

      <p className="face-micro face-card-label">Agent Activity</p>

      {loading ? (
        <p className="face-card-empty">Reading…</p>
      ) : !readable ? (
        <>
          <p className="face-card-empty">Not answering</p>
          <p className="face-card-caption">
            The activity feed could not be read just now. Nothing else on this screen depends
            on it.
          </p>
        </>
      ) : items.length === 0 ? (
        <p className="face-card-empty">No agent activity in the last 30 minutes</p>
      ) : (
        <ul className="face-activity-list" aria-live="polite">
          {items.map((item, index) => (
            <li key={`${item.at ?? 'unknown'}-${index}`} className="face-activity-item">
              <span
                className="face-activity-dot"
                data-fresh={item.fresh ? 'true' : 'false'}
                aria-hidden
              />
              <span className="face-activity-text">
                <span className="face-activity-agent">{item.from}</span>{' '}
                <span className="face-activity-verb">{item.verb}</span>
                {item.to ? <span className="face-activity-to"> to {item.to}</span> : null}
              </span>
              {item.relative ? <span className="face-activity-time">{item.relative}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default FaceActivityTrail;

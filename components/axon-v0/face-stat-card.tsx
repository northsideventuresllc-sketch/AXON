'use client';

/**
 * THE FACE — glass stat card and module list (Build Plan B, step 2).
 *
 * Palette is locked to the spec: ground #07080C, cyan #00D4FF, navy #0A1628. No green, no
 * amber — "Needs attention" is a hollow cyan pill and "Off" is muted grey.
 *
 * The rule these components exist to hold: a number nobody could read is never drawn as a
 * number. `value === null` renders the card's written empty state, and `loading` renders a
 * quiet placeholder. Neither ever becomes a zero.
 */
import type { FaceModule } from '@/lib/axon-v0/face-reads';

export interface FaceStatCardProps {
  /** Monospaced all-caps micro-label above the number. */
  label: string;
  /** The number itself. `null` means "we could not read this" — the empty state shows instead. */
  value: number | null;
  /** One plain sentence under the number saying what it counts. */
  caption: string;
  /** True until the first answer arrives. */
  loading?: boolean;
  /** What to say when there is no number. Defaults to the house line. */
  emptyLabel?: string;
  /** Set on the revenue card: designed on purpose, not a failed read. */
  planned?: boolean;
}

export function FaceStatCard({
  label,
  value,
  caption,
  loading = false,
  emptyLabel = 'No data yet',
  planned = false,
}: FaceStatCardProps) {
  const showNumber = !loading && typeof value === 'number';

  return (
    <article className="face-card" data-empty={showNumber ? 'false' : 'true'}>
      <span className="face-card-bracket face-card-bracket--tl" aria-hidden />
      <span className="face-card-bracket face-card-bracket--br" aria-hidden />

      <p className="face-micro face-card-label">{label}</p>

      {loading ? (
        <p className="face-card-empty">Reading…</p>
      ) : showNumber ? (
        <p className="face-card-value">{value!.toLocaleString('en-US')}</p>
      ) : (
        <p className="face-card-empty">{planned ? 'Not wired' : emptyLabel}</p>
      )}

      <p className="face-card-caption">{caption}</p>
    </article>
  );
}

const HEALTH_CLASS: Record<FaceModule['health'], string> = {
  'On track': 'face-pill--ontrack',
  Quiet: 'face-pill--quiet',
  'Needs attention': 'face-pill--attention',
  Off: 'face-pill--off',
};

function ModuleRow({ module }: { module: FaceModule }) {
  return (
    <li className="face-module">
      <span className="face-module-name">{module.name}</span>
      <span className={`face-pill ${HEALTH_CLASS[module.health]}`}>{module.health}</span>
    </li>
  );
}

export interface FaceModuleListProps {
  live: FaceModule[];
  planned: FaceModule[];
  loading?: boolean;
  /** False when the roster could not be read at all — say so rather than showing an empty list. */
  readable?: boolean;
}

/** One row per roster agent, grouped Live / Planned, names exactly as the roster stores them. */
export function FaceModuleList({
  live,
  planned,
  loading = false,
  readable = true,
}: FaceModuleListProps) {
  if (loading) {
    return (
      <section className="face-card face-modules">
        <p className="face-micro face-card-label">Modules</p>
        <p className="face-card-empty">Reading…</p>
      </section>
    );
  }

  if (!readable || live.length + planned.length === 0) {
    return (
      <section className="face-card face-modules">
        <p className="face-micro face-card-label">Modules</p>
        <p className="face-card-empty">No data yet</p>
        <p className="face-card-caption">
          The agent roster is not answering. Nothing else on this screen depends on it.
        </p>
      </section>
    );
  }

  return (
    <section className="face-card face-modules">
      <p className="face-micro face-card-label">Modules</p>

      <div className="face-module-group">
        <p className="face-micro face-module-heading">Live · {live.length}</p>
        {live.length ? (
          <ul className="face-module-list">
            {live.map((module) => (
              <ModuleRow key={`live-${module.name}`} module={module} />
            ))}
          </ul>
        ) : (
          <p className="face-card-caption">Nothing is running right now.</p>
        )}
      </div>

      <div className="face-module-group">
        <p className="face-micro face-module-heading">Planned · {planned.length}</p>
        {planned.length ? (
          <ul className="face-module-list">
            {planned.map((module) => (
              <ModuleRow key={`planned-${module.name}`} module={module} />
            ))}
          </ul>
        ) : (
          <p className="face-card-caption">Every agent on the roster is running.</p>
        )}
      </div>
    </section>
  );
}

export default FaceStatCard;

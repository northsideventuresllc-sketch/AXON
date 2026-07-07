import { MAX_DRAFTS_PER_DAY } from '@/lib/constants.mjs';
import { AxonResetSettings } from '@/components/axon/axon-reset-settings';
import { AxonHomeSettings } from '@/components/axon/axon-home-settings';
import { AxonNotificationSettings } from '@/components/axon/axon-notification-settings';
import { AxonToolNameSettings } from '@/components/axon/axon-tool-name-settings';
import { fetchTopSignals, fetchMemories, getOperatorProfile } from '@/lib/axon-profile';
import { getOutreachTrainingSummary } from '@/lib/outreach-learn';
import { getPreferences } from '@/lib/axon-preferences';

export const dynamic = 'force-dynamic';

const GUARDRAILS = [
  { label: 'No auto-send', detail: 'Every outbound requires JB approval via dashboard or Telegram.' },
  { label: 'Daily cap', detail: `Max ${MAX_DRAFTS_PER_DAY} new drafts per day.` },
  { label: 'API budget', detail: '$20/mo cap — monitor Anthropic console.' },
  { label: 'Adaptive tone', detail: 'AXON learns from every message. Reset anytime below.' },
];

export default async function SettingsPage() {
  const [profile, signals, memories, preferences, outreachTraining] = await Promise.all([
    getOperatorProfile(),
    fetchTopSignals(undefined, 8),
    fetchMemories(undefined, 5),
    getPreferences(),
    getOutreachTrainingSummary({ limit: 40 }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold axon-gradient-text">Settings</h1>
        <p className="mt-1 text-sm text-axon-muted">Customize your home page, notifications, voice, and learning.</p>
      </header>

      <AxonHomeSettings initial={preferences.homeLayout} />
      <AxonNotificationSettings initial={preferences.notifications} />
      <AxonToolNameSettings />

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
        <h2 className="text-sm font-medium">Communication Profile</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-axon-muted">Input mode</dt>
            <dd className="capitalize">{profile.input_mode}</dd>
          </div>
          <div>
            <dt className="text-axon-muted">Read aloud</dt>
            <dd>{profile.read_aloud ? 'On' : 'Off'}</dd>
          </div>
          <div>
            <dt className="text-axon-muted">Voice</dt>
            <dd>{profile.voice_id}</dd>
          </div>
          <div>
            <dt className="text-axon-muted">Active signals</dt>
            <dd>{signals.length}</dd>
          </div>
        </dl>
        {profile.tone_preset.summary && (
          <p className="mt-4 text-xs text-axon-muted">{profile.tone_preset.summary}</p>
        )}
      </section>

      {signals.length > 0 && (
        <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
          <h2 className="text-sm font-medium">Top Communication Learnings</h2>
          <div className="mt-4 space-y-2">
            {signals.map((s) => (
              <div key={s.id} className="flex justify-between gap-4 text-xs">
                <span className="text-axon-muted">
                  [{s.signal_type}] {s.signal_key}
                </span>
                <span className="font-mono text-axon-cyan">w{s.weight.toFixed(1)} · n{s.evidence_count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
        <h2 className="text-sm font-medium">Outreach Training Learnings</h2>
        <p className="mt-1 text-xs text-axon-muted">
          From draft edits, reject reasons, and approvals in NI Outreach HQ — injected into nightly drafts.
        </p>
        {outreachTraining.active ? (
          <div className="mt-4 space-y-4">
            {outreachTraining.topRejectReasons.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-axon-muted">Avoid</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {outreachTraining.topRejectReasons.slice(0, 6).map(({ reason, count }) => (
                    <li key={reason} className="flex justify-between gap-3 text-axon-text">
                      <span>{reason}</span>
                      <span className="font-mono text-xs text-axon-muted">×{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <dl className="grid gap-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-axon-muted">Signals</dt>
                <dd className="font-mono text-axon-teal">{outreachTraining.signalCount}</dd>
              </div>
              <div>
                <dt className="text-axon-muted">Approved</dt>
                <dd className="font-mono">{outreachTraining.approvals.total}</dd>
              </div>
              <div>
                <dt className="text-axon-muted">Unchanged</dt>
                <dd className="font-mono">{outreachTraining.approvals.unchanged}</dd>
              </div>
              {outreachTraining.icpDropCount > 0 && (
                <div>
                  <dt className="text-axon-muted">ICP drops</dt>
                  <dd className="font-mono">{outreachTraining.icpDropCount}</dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <p className="mt-4 text-sm text-axon-muted">
            No training signals yet. Edit a draft or reject with a reason in Outreach HQ.
          </p>
        )}
      </section>

      {memories.length > 0 && (
        <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
          <h2 className="text-sm font-medium">Recent Memories</h2>
          <ul className="mt-4 space-y-2 text-sm text-axon-muted">
            {memories.map((m) => (
              <li key={m.id}>
                <span className="text-[10px] uppercase text-axon-blue-glow">{m.memory_type}</span> — {m.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AxonResetSettings />

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
        <h2 className="text-sm font-medium">Guardrails</h2>
        <div className="mt-4 space-y-4">
          {GUARDRAILS.map((g) => (
            <div key={g.label} className="border-l-2 border-axon-blue/40 pl-4">
              <p className="text-sm font-medium">{g.label}</p>
              <p className="text-xs text-axon-muted">{g.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

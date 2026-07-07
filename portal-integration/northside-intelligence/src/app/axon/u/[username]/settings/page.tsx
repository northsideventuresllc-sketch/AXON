import { AxonChangeCodeForm } from '@/components/axon/AxonChangeCodeForm';
import { AxonHomeSettings } from '@/components/axon-ui/axon-home-settings';
import { AxonNotificationSettings } from '@/components/axon-ui/axon-notification-settings';
import { AxonResetSettings } from '@/components/axon-ui/axon-reset-settings';
import { fetchMemories, fetchTopSignals, getOperatorProfile } from '@/lib/axon/axon-profile';
import { getPreferences } from '@/lib/axon/axon-preferences';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

const GUARDRAILS = [
  { label: 'No auto-send', detail: 'Every outbound requires JB approval via dashboard or Telegram.' },
  { label: 'Daily cap', detail: 'Max 15 new drafts per day.' },
  { label: 'API budget', detail: '$20/mo cap — monitor Anthropic console.' },
  { label: 'Adaptive tone', detail: 'AXON learns from every message. Reset anytime below.' },
];

export default async function AxonSettingsPage({ params }: { params: { username: string } }) {
  const { operatorId } = await requireAxonPortalUser(params.username);

  const [profile, signals, memories, preferences] = await Promise.all([
    getOperatorProfile(operatorId),
    fetchTopSignals(operatorId, 8),
    fetchMemories(operatorId, 5),
    getPreferences(operatorId),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold axon-gradient-text">Settings</h1>
        <p className="mt-1 text-sm text-axon-muted">Customize your home page, notifications, voice, and learning.</p>
      </header>

      <AxonHomeSettings initial={preferences.homeLayout} />
      <AxonNotificationSettings initial={preferences.notifications} />

      <AxonChangeCodeForm />

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
                <span className="font-mono text-axon-cyan">
                  w{s.weight.toFixed(1)} · n{s.evidence_count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {memories.length > 0 && (
        <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
          <h2 className="text-sm font-medium">Recent Memories</h2>
          <ul className="mt-4 space-y-2 text-sm text-axon-muted">
            {memories.map((m) => (
              <li key={m.id}>
                <span className="text-[10px] uppercase text-axon-blue-glow">{m.memory_type}</span> —{' '}
                {m.content}
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

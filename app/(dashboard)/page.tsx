import { AxonInterface } from '@/components/axon/axon-interface';
import { ToolPanel } from '@/components/axon/tool-panel';
import { fetchChatHistory, getOperatorProfile } from '@/lib/axon-profile';
import { AXON_TOOLS } from '@/lib/axon-types';
import { fetchPipelineStats } from '@/lib/leads';

export const dynamic = 'force-dynamic';

export default async function AxonHomePage() {
  const [profile, messages, stats] = await Promise.all([
    getOperatorProfile(),
    fetchChatHistory(undefined, 30),
    fetchPipelineStats().catch(() => null),
  ]);

  const metrics: Record<string, string | number> = {};
  if (stats) {
    metrics['ni-services-outreach'] = stats.pending;
  }

  return (
    <div className="space-y-8">
      <header className="text-center lg:text-left">
        <p className="text-xs uppercase tracking-[0.35em] text-axon-gold">NORTHSiDE · Sector 5</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">AXON</h1>
        <p className="mt-2 text-sm text-axon-muted">
          Your autonomous partner. Chat or voice — I adapt to how you communicate.
        </p>
      </header>

      <AxonInterface
        initialMessages={messages}
        initialProfile={{
          input_mode: profile.input_mode,
          read_aloud: profile.read_aloud,
          voice_id: profile.voice_id,
          tone_preset: profile.tone_preset,
        }}
      />

      <ToolPanel tools={AXON_TOOLS} metrics={metrics} />
    </div>
  );
}

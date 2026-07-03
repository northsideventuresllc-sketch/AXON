import { AxonInterface } from '@/components/axon/axon-interface';
import { ToolPanel } from '@/components/axon/tool-panel';
import { fetchChatHistory, getOperatorProfile } from '@/lib/axon-profile';
import { getWorkspace } from '@/lib/axon-workspace';
import { AXON_TOOLS } from '@/lib/axon-types';
import { fetchPipelineStats } from '@/lib/leads';

export const dynamic = 'force-dynamic';

export default async function AxonHomePage() {
  const [profile, messages, stats, workspace] = await Promise.all([
    getOperatorProfile(),
    fetchChatHistory(undefined, 30),
    fetchPipelineStats().catch(() => null),
    getWorkspace(),
  ]);

  const metrics: Record<string, string | number> = {};
  if (stats) {
    metrics['ni-services-outreach'] = stats.pending;
  }

  return (
    <div className="relative space-y-8">
      <header className="text-center lg:text-left">
        <p className="text-xs uppercase tracking-[0.2em] text-axon-purple-glow">
          Northside Intelligence
        </p>
        <h1 className="mt-2 bg-gradient-to-r from-axon-text via-axon-purple-glow to-axon-gold bg-clip-text text-2xl font-semibold text-transparent sm:text-3xl">
          AXON
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Northside Intelligence&apos;s State of the Art Personalized Agentic Assistant
        </p>
      </header>

      <AxonInterface
        initialMessages={messages}
        initialWorkspace={workspace}
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

import Link from 'next/link';
import { AxonInterface } from '@/components/axon-ui/axon-interface';
import { ToolPanel } from '@/components/axon-ui/tool-panel';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';
import { fetchChatHistory, getOperatorProfile } from '@/lib/axon/axon-profile';
import { getPreferences } from '@/lib/axon/axon-preferences';
import { AXON_TOOLS } from '@/lib/axon/axon-types';
import { getWorkspace } from '@/lib/axon/axon-workspace';
import { fetchPipelineStats } from '@/lib/axon/leads';
import { axonPublicPath } from '@/lib/axon/paths';

export const dynamic = 'force-dynamic';

const AXON_HOME_URL = 'https://northsideintelligence.com/axon';

export default async function AxonUserDashboardPage({
  params,
}: {
  params: { username: string };
}) {
  const { username, operatorId } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  const [operatorProfile, messages, stats, workspace, preferences] = await Promise.all([
    getOperatorProfile(operatorId),
    fetchChatHistory(operatorId, 30),
    fetchPipelineStats().catch(() => null),
    getWorkspace(operatorId),
    getPreferences(operatorId),
  ]);

  const metrics: Record<string, string | number> = {};
  if (stats) metrics['ni-services-outreach'] = stats.pending;

  return (
    <div className="space-y-8">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-axon-blue-glow">
          Northside Intelligence
        </p>
        <h1 className="mt-2 text-2xl font-semibold axon-gradient-text sm:text-3xl">AXON</h1>
        <p className="mt-2 text-sm text-axon-muted">Operator: @{username}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs uppercase tracking-[0.1em]">
          <a href={AXON_HOME_URL} className="text-axon-blue-glow hover:underline">
            AXON Home
          </a>
          <span className="text-axon-border">|</span>
          <Link href="/" className="text-axon-blue-glow hover:underline">
            Back to NI Portal
          </Link>
        </div>
      </header>

      <AxonInterface
        basePath={basePath}
        initialMessages={messages}
        initialWorkspace={workspace}
        initialPreferences={preferences}
        initialProfile={{
          input_mode: operatorProfile.input_mode,
          read_aloud: operatorProfile.read_aloud,
          voice_id: operatorProfile.voice_id,
          tone_preset: operatorProfile.tone_preset,
        }}
      />

      <ToolPanel tools={AXON_TOOLS} metrics={metrics} basePath={basePath} />
    </div>
  );
}

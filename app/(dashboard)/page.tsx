import { AxonInterface } from '@/components/axon/axon-interface';
import { DroidSpace } from '@/components/axon/droid-space';
import { fetchChatHistory, getOperatorProfile } from '@/lib/axon-profile';
import { getWorkspace } from '@/lib/axon-workspace';
import { getPreferences } from '@/lib/axon-preferences';

export const dynamic = 'force-dynamic';

export default async function AxonHomePage() {
  const [profile, messages, workspace, preferences] = await Promise.all([
    getOperatorProfile(),
    fetchChatHistory(undefined, 30),
    getWorkspace(),
    getPreferences(),
  ]);

  return (
    <div className="relative space-y-8">
      <header className="mx-auto max-w-3xl overflow-visible pb-2 pt-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-axon-blue-glow">
          Northside Intelligence
        </p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight axon-gradient-text sm:text-3xl">
          AXON
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-axon-muted">
          Northside Intelligence&apos;s State of the Art Personalized Agentic Assistant
        </p>
      </header>

      <AxonInterface
        initialMessages={messages}
        initialWorkspace={workspace}
        initialPreferences={preferences}
        initialProfile={{
          input_mode: profile.input_mode,
          read_aloud: profile.read_aloud,
          voice_id: profile.voice_id,
          tone_preset: profile.tone_preset,
        }}
      />

      <DroidSpace />
    </div>
  );
}

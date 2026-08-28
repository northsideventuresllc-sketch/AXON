#!/usr/bin/env node
/**
 * FIRST TEST for the computer_use routing capability (lib/axon-computer-use.mjs).
 *
 * Run: node scripts/test-computer-use-video-task.mjs
 * Requires SUPABASE_SERVICE_KEY (or _ROLE_KEY) + ANTHROPIC_API_KEY in the environment,
 * or the equivalent rows in ni_platform_secrets — same as every other AXON script.
 *
 * This is the proof task JB specified: pull a real Gemini/Flow video for Match Fit and
 * get the MP4 saved locally on the mini — the thing that has failed repeatedly the old
 * way (NI-Brain Learnings #6796/#6797/#6803/#6983, #7128/#7332/#7333). It does NOT wire
 * into the matchfit content-calendar pipeline — that's a separate, later step, only if
 * this passes. Per JB: if this doesn't clear, don't build the capability further.
 *
 * PASS bar: a real MP4 (not a static image) lands at /Users/Shared/nvg-media on the
 * mini. This script does not itself verify file contents past what the model reports —
 * confirm the result by hand (or a follow-up shell job) before calling this "proven."
 */

import { runComputerUseTask } from '../lib/axon-computer-use.mjs';

const TASK_DESCRIPTION = `
On this machine's already-logged-in Chrome, open Gemini (or Google Flow if that is the
active video-generation surface) and generate a short vertical (9:16) video clip suitable
for a Match Fit social post — the topic can be a generic soccer-training / performance-
tracking theme if no specific brief is loaded. Wait for the video to finish rendering
(this can take several minutes — check back with a screenshot rather than assuming it's
done). Once rendered, download the actual video file (not a still frame or thumbnail) and
save it into /Users/Shared/nvg-media. Report back the exact filename you saved and confirm
whether what you downloaded is a real video (has a play control / duration) as opposed to
a static image — that distinction is the entire point of this test.
`.trim();

async function main() {
  console.log('[test-computer-use-video-task] starting — this can take several minutes...');
  const result = await runComputerUseTask({
    taskDescription: TASK_DESCRIPTION,
    maxSteps: 40,
    timeoutMs: 20 * 60_000,
  });

  console.log(`\n[test-computer-use-video-task] outcome: ${result.outcome}`);
  console.log(`[test-computer-use-video-task] steps taken: ${result.steps}`);
  console.log(`[test-computer-use-video-task] duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`\n[test-computer-use-video-task] final report from the model:\n${result.finalText || '(none)'}`);
  console.log(
    `\n[test-computer-use-video-task] action transcript (${result.transcript.length} steps):\n` +
      result.transcript.map((t) => `  ${t.step}. ${t.action}${t.error ? ' (ERROR)' : ''}`).join('\n'),
  );

  if (result.outcome !== 'complete') {
    console.error(
      `\n[test-computer-use-video-task] DID NOT COMPLETE (${result.outcome}) — this is a fail, not a pass. ` +
        'Per JB: do not build this capability further until a real run clears cleanly.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    '\n[test-computer-use-video-task] Model reported completion. This is NOT yet independently verified — ' +
      'confirm a real .mp4 actually exists at /Users/Shared/nvg-media on the mini before calling this proven.',
  );
}

main().catch((err) => {
  console.error('[test-computer-use-video-task] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

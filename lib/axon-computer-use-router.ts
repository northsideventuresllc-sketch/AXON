// Cheap yes/no classifier deciding whether a task needs the computer_use route instead
// of a text-only model reply. Same failover posture as the rest of the router: on any
// failure this fails CLOSED (returns false) so an unreachable classifier never silently
// routes a normal chat message into the slower, more expensive computer-use loop.
import { HAIKU_MODEL } from './constants.mjs';
import { loadConfig } from './config.mjs';
import { createSupabaseClient } from './supabase.mjs';

const CLASSIFY_TIMEOUT_MS = 8_000;

export async function shouldUseComputerUse(taskText: string): Promise<boolean> {
  if (!taskText?.trim()) return false;

  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const { sbSelect } = createSupabaseClient(key);
    const cfg = await loadConfig(sbSelect);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': cfg.anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 5,
          system:
            'Answer only "yes" or "no", nothing else. Does completing the following task require ' +
            'clicking through or navigating a website or desktop app that has no API to call instead?',
          messages: [{ role: 'user', content: taskText.slice(0, 2000) }],
        }),
        signal: controller.signal,
      });
      if (!r.ok) return false;
      const data = await r.json();
      const text = (data?.content?.[0]?.text || '').trim().toLowerCase();
      return text.startsWith('yes');
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

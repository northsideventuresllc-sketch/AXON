// Omni-Router v0: per-agent model routing.
// mode=auto  → caller uses the canonical AXON tier chain (generateAxonReply).
// mode=fixed → route to the assigned BYO provider here. Keys never reach the client.
import { getAssignment, getProviderWithKey } from './store';

export interface RoutedReply {
  reply: string;
  route: string; // human-readable route label for the UI's "what AXON is doing" panel
}

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string | null,
  model: string,
  messages: ChatMsg[]
): Promise<string> {
  const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024 }),
  });
  if (!r.ok) throw new Error(`provider HTTP ${r.status}`);
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('provider returned no content');
  return text;
}

async function callAnthropic(apiKey: string, model: string, messages: ChatMsg[]): Promise<string> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: messages.filter((m) => m.role !== 'system'),
    }),
  });
  if (!r.ok) throw new Error(`anthropic HTTP ${r.status}`);
  const data = await r.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('anthropic returned no content');
  return text;
}

async function callGemini(apiKey: string, model: string, messages: ChatMsg[]): Promise<string> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      }),
    }
  );
  if (!r.ok) throw new Error(`gemini HTTP ${r.status}`);
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini returned no content');
  return text;
}

/**
 * Returns a reply from the agent's fixed provider, or null when the agent is
 * on AXON auto (caller then runs the canonical tier chain).
 */
export async function routeFixedIfAssigned(
  agentId: string,
  messages: ChatMsg[]
): Promise<RoutedReply | null> {
  const assignment = await getAssignment(agentId);
  if (!assignment || assignment.mode !== 'fixed' || !assignment.provider_id) return null;
  const provider = await getProviderWithKey(assignment.provider_id);
  if (!provider) return null;

  let reply: string;
  if (provider.kind === 'anthropic' && provider.api_key) {
    reply = await callAnthropic(provider.api_key, provider.model, messages);
  } else if (provider.kind === 'gemini' && provider.api_key) {
    reply = await callGemini(provider.api_key, provider.model, messages);
  } else {
    const base =
      provider.base_url || (provider.kind === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1');
    reply = await callOpenAICompatible(base, provider.api_key, provider.model, messages);
  }
  return { reply, route: `fixed → ${provider.model}` };
}

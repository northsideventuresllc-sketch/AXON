// lib/axon-router/adapters/index.mjs
//
// Registry: routeName -> { send }. See spec §1 for the callAdapter contract
// and §2 for how a new provider gets added here.
//
// claude-cli is day-2 (cuttable per spec §8) — not wired yet.

import { send as anthropicApiSend } from './anthropic-api.mjs';
import { send as geminiApiSend } from './gemini-api.mjs';
import { send as ollamaLocalSend } from './ollama-local.mjs';
import { send as openrouterSend } from './openrouter.mjs';

export const adapters = {
  'anthropic-api': { send: anthropicApiSend },
  'gemini-api': { send: geminiApiSend },
  'ollama-local': { send: ollamaLocalSend },
  openrouter: { send: openrouterSend },
};

// callAdapter is a thin resolver — this is the whole definition (spec §1).
export async function callAdapter(routeName, model, payload) {
  return adapters[routeName].send({ ...payload, model });
}

import { createSupabaseClient } from './supabase.mjs';

export {
  BRAIN_GAP_CATALOG,
  JSPACE_ARCHITECTURE,
  JSPACE_BROADCAST_MODULES,
  JSPACE_MAX_CONCEPTS,
  formatJspaceForPrompt,
  getJspaceState,
} from './axon-j-space-core.mjs';

export async function loadJspacePromptBlock(): Promise<string> {
  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!key) return '';
    const { sbSelect } = createSupabaseClient(key);
    const { getJspaceState, formatJspaceForPrompt } = await import('./axon-j-space-core.mjs');
    const state = await getJspaceState(sbSelect);
    if (!state.active_concepts?.length && !state.implementation_queue?.length) {
      return '';
    }
    return `\n${formatJspaceForPrompt(state)}`;
  } catch {
    return '';
  }
}

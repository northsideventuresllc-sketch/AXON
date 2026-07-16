import { createSupabaseClient } from './supabase.mjs';
import {
  WISDOM_ITEMS_TABLE,
  formatWisdomForPrompt,
} from './wisdom-absorb-loop.mjs';

/** Load top absorbed wisdom for chat / J-space prompt injection. */
export async function loadWisdomPromptBlock(): Promise<string> {
  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!key) return '';
    const { sbSelect } = createSupabaseClient(key);
    const rows = await sbSelect(
      WISDOM_ITEMS_TABLE,
      'status=eq.absorbed&select=title,principle,application,domain,source_type,salience,confidence&order=salience.desc&limit=6',
    );
    if (!rows?.length) return '';
    return `\n${formatWisdomForPrompt(rows)}`;
  } catch {
    return '';
  }
}

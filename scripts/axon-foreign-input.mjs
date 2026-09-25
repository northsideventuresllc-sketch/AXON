#!/usr/bin/env node
/**
 * AXON Foreign-Input Feed — scheduled excitatory counterweight to the Inhibitor.
 *
 * Posts one foreign-domain concept into J-space per run so retrieval gain
 * cannot converge on itself. Additive only: it never deletes, expires or
 * downgrades any memory (AXON NEVER FORGETS).
 *
 * Run: node scripts/axon-foreign-input.mjs
 * Dry: AXON_DRY_RUN=1 node scripts/axon-foreign-input.mjs
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { getJspaceState, postConcept, saveJspaceState } from '../lib/axon-j-space-core.mjs';
import { pickForeignDomain, buildForeignConcept } from '../lib/axon-foreign-input-core.mjs';
import { webSearch } from '../lib/web-search.mjs';

/**
 * AX-SERPAPI-QUOTA-PATCHED-NOT-FIXED-0917: this script previously called SerpApi
 * directly (and read the wrong env var, `SERPAPI_KEY` instead of `SERPAPI_API_KEY`),
 * so it always silently returned zero sources with no fallback. Routed through the
 * shared `webSearch` door — same free-fallback pattern every other caller uses
 * (SerpApi while it has quota, keyless DuckDuckGo when it does not).
 */
async function searchWeb(serpApiKey, query) {
  const { results } = await webSearch({ serpApiKey, query, num: 4 });
  return results.map((r) => ({ title: r.title, link: r.link, snippet: r.snippet || '' }));
}

async function main() {
  console.log(`AXON foreign-input feed — ${new Date().toISOString()}`);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(key);
  const dryRun = process.env.AXON_DRY_RUN === '1';

  const domain = pickForeignDomain();
  const sources = await searchWeb(process.env.SERPAPI_API_KEY, domain.query);
  const concept = buildForeignConcept(domain, sources);

  console.log(`Foreign domain: ${domain.label} · ${sources.length} source(s)`);

  if (dryRun) {
    console.log('DRY RUN — concept not posted:', JSON.stringify(concept, null, 2));
    return;
  }

  const state = await getJspaceState(sbSelect, 'default');
  const next = postConcept(state, concept);
  await saveJspaceState(sbInsert, sbPatch, next, 'default', sbSelect);
  console.log(`Posted foreign concept "${concept.label}" into J-space.`);
}

main().catch((e) => {
  console.error('foreign-input feed failed:', e.message);
  process.exit(1);
});

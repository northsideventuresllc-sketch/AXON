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

async function searchWeb(serpApiKey, query) {
  if (!serpApiKey) return [];
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '4');
  url.searchParams.set('api_key', serpApiKey);
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.organic_results || []).slice(0, 4).map((i) => ({
      title: i.title,
      link: i.link,
      snippet: i.snippet || '',
    }));
  } catch {
    return [];
  }
}

async function main() {
  console.log(`AXON foreign-input feed — ${new Date().toISOString()}`);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(key);
  const dryRun = process.env.AXON_DRY_RUN === '1';

  const domain = pickForeignDomain();
  const sources = await searchWeb(process.env.SERPAPI_KEY, domain.query);
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

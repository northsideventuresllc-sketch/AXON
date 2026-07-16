#!/usr/bin/env node
/**
 * AX-COMM-SKILL unit tests — run: node tests/axon-comm-skill.test.mjs
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_TECHNIQUES,
  buildCommSkillInstructions,
  commSkillChecklist,
  heuristicAdaptTechniques,
  matchSignalToTechniques,
  mergeTechniquesWithDefaults,
  runCommSkillAdapt,
  silentInstructionFor,
} from '../lib/axon-comm-skill.mjs';
const merged = mergeTechniquesWithDefaults([
  {
    technique_id: 'T1',
    description: 'One thing per message — single ask, single outcome',
    weight: 2.5,
    evidence: 'live',
    source: 'jb-session',
  },
]);
assert.ok(merged.length >= DEFAULT_TECHNIQUES.length);
assert.equal(merged.find((t) => t.technique_id === 'T1')?.weight, 2.5);
assert.ok(merged.some((t) => t.technique_id === 'T4'));

const block = buildCommSkillInstructions(merged, { channel: 'telegram' });
assert.match(block, /apply silently/i);
assert.match(block, /NORTHSiDE/);
assert.match(block, /One ask or outcome/);
assert.doesNotMatch(block, /technique_id/);
assert.match(block, /Telegram/);

assert.equal(silentInstructionFor({ technique_id: 'T4', description: 'x', weight: 1 }), 'No meta narration of process, plans, or techniques');

const hits = matchSignalToTechniques({
  signal_type: 'preference',
  signal_key: 'chunking',
  signal_value: 'JB wants digestible chunks, not walls of text',
  weight: 3,
});
assert.ok(hits.some((h) => h.technique_id === 'T2'));

const plan = heuristicAdaptTechniques({
  techniques: merged,
  signals: [
    {
      signal_type: 'preference',
      signal_key: 'one_thing',
      signal_value: 'one thing at a time please',
      weight: 4,
    },
    {
      signal_type: 'phrasing',
      signal_key: 'lead',
      signal_value: 'What\'s the play today?',
      weight: 2,
    },
  ],
});
assert.equal(plan.provider, 'heuristic');
assert.ok(plan.changedCount >= 1);
assert.ok(plan.updates.find((u) => u.technique_id === 'T1')?.changed);

const dry = await runCommSkillAdapt({
  techniques: merged,
  signals: [
    {
      signal_type: 'preference',
      signal_key: 'no_meta',
      signal_value: "don't tell me what you're doing",
      weight: 3,
    },
  ],
  dryRun: true,
});
assert.equal(dry.ok, true);
assert.equal(dry.dryRun, true);
assert.equal(dry.persisted, null);
assert.equal(dry.appliedCount, 0);
assert.match(dry.summary, /AX-COMM-SKILL/);
assert.match(dry.promptPreview, /NORTHSiDE/);

let patched = 0;
const liveish = await runCommSkillAdapt({
  techniques: [
    { technique_id: 'T2', description: 'Chunk', weight: 1, id: 99 },
  ],
  signals: [
    {
      signal_type: 'preference',
      signal_key: 'shorter',
      signal_value: 'shorter digestible chunks please',
      weight: 5,
    },
  ],
  dryRun: false,
  patchTechnique: async () => {
    patched += 1;
    return { ok: true };
  },
  persist: async (record) => {
    assert.equal(record.provider, 'heuristic');
    assert.equal(record.dry_run, false);
    return { id: 'run-1', ...record };
  },
});
assert.ok(patched >= 1);
assert.ok(liveish.persisted);
assert.equal(liveish.appliedCount, patched);

const checklist = commSkillChecklist();
assert.ok(checklist.length >= 5);
assert.ok(checklist.some((l) => /NORTHSiDE/.test(l)));
assert.ok(checklist.some((l) => /dual-brain|AGENTS|axon_communication/.test(l)));

console.log('axon-comm-skill.test.mjs OK');

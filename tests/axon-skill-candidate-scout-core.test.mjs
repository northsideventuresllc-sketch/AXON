#!/usr/bin/env node
/**
 * AXON Skill Candidate Scout core tests — run: node tests/axon-skill-candidate-scout-core.test.mjs
 *
 * Pure-function coverage for lib/axon-skill-candidate-scout-core.mjs
 * (AX-SMALL-BUILDS-BUNDLE-0904 item 3). No network, no fs, no Supabase.
 */
import assert from 'node:assert/strict';
import {
  analyzeNotesForSkillCandidates,
  renderScoutEntry,
  withNewScoutEntry,
  buildScoutLearningRow,
} from '../lib/axon-skill-candidate-scout-core.mjs';

// ---------- analyzeNotesForSkillCandidates: repeated phrase across distinct notes ----------
{
  const repeated = 'please double check the vercel deployment logs before merging';
  const notes = [
    { id: 1, text: repeated },
    { id: 2, text: `unrelated note. ${repeated} thanks.` },
    { id: 3, text: `${repeated} — again today` },
    { id: 4, text: 'a completely different note about something else entirely' },
  ];
  const result = analyzeNotesForSkillCandidates(notes);
  assert.equal(result.notesScanned, 4);
  assert.ok(result.candidates.length >= 1, 'a phrase repeated across 3 distinct notes should surface');
  const top = result.candidates[0];
  assert.ok(top.distinctNotes >= 3);
  assert.equal(result.personaFlags.length, 0, 'no persona hint in these notes');
}

// ---------- does not count repeats WITHIN one note as multiple distinct notes ----------
{
  const phrase = 'always verify the supabase service key before running';
  const notes = [
    { id: 1, text: `${phrase}. ${phrase}. ${phrase}.` }, // same note, repeated 3x
    { id: 2, text: 'nothing relevant here at all' },
  ];
  const result = analyzeNotesForSkillCandidates(notes);
  assert.equal(result.candidates.length, 0, 'repetition within a single note must not count as 3 distinct notes');
}

// ---------- low-signal (stopword-heavy) shingles are filtered ----------
{
  const notes = [
    { id: 1, text: 'this is the way that it was and it will be' },
    { id: 2, text: 'this is the way that it was and it will be' },
    { id: 3, text: 'this is the way that it was and it will be' },
  ];
  const result = analyzeNotesForSkillCandidates(notes);
  assert.equal(result.candidates.length, 0, 'a stopword-only shingle should never be proposed as a candidate');
}

// ---------- persona hint detection ----------
{
  const notes = [
    { id: 1, text: 'we really need a dedicated agent for handling refunds going forward' },
    { id: 2, text: 'JB said we need a new agent for this, ping ARCEUS' },
  ];
  const result = analyzeNotesForSkillCandidates(notes);
  assert.equal(result.personaFlags.length, 2);
  assert.equal(result.personaFlags[0].noteId, 1);
}

// ---------- empty input never throws ----------
{
  const result = analyzeNotesForSkillCandidates([]);
  assert.equal(result.notesScanned, 0);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.personaFlags, []);
}
{
  const result = analyzeNotesForSkillCandidates([{ id: 1, text: '' }, { id: 2 }]);
  assert.equal(result.candidates.length, 0);
}

// ---------- renderScoutEntry ----------
{
  const md = renderScoutEntry({
    dateIso: '2026-09-05',
    lookbackDays: 14,
    result: {
      notesScanned: 10,
      candidates: [{ phrase: 'check the deploy logs first', distinctNotes: 4, exampleNoteId: 7 }],
      personaFlags: [{ noteId: 3, excerpt: 'we need a dedicated agent for X' }],
    },
  });
  assert.match(md, /## Skill candidate scout — 2026-09-05/);
  assert.match(md, /Scanned 10 session_notes_apartment/);
  assert.match(md, /check the deploy logs first/);
  assert.match(md, /file to ARCEUS/);
  assert.match(md, /proposal only/i);
}
{
  const md = renderScoutEntry({
    dateIso: '2026-09-05',
    lookbackDays: 14,
    result: { notesScanned: 0, candidates: [], personaFlags: [] },
  });
  assert.match(md, /no phrase repeated/);
  assert.match(md, /none detected this run/);
}

// ---------- withNewScoutEntry: prepend + cap ----------
{
  const v1 = withNewScoutEntry('', 'run-1');
  assert.match(v1, /# AXON Skill Candidate Proposals/);
  const v2 = withNewScoutEntry(v1, 'run-2');
  assert.ok(v2.indexOf('run-2') < v2.indexOf('run-1'), 'newest run is prepended');

  let content = '';
  for (let i = 0; i < 30; i++) content = withNewScoutEntry(content, `run-${i}`);
  const runCount = (content.match(/run-\d+/g) || []).length;
  assert.ok(runCount <= 20, `entries capped at 20, got ${runCount}`);
}

// ---------- buildScoutLearningRow ----------
{
  const row = buildScoutLearningRow({
    result: { notesScanned: 10, candidates: [{ phrase: 'x', distinctNotes: 3 }], personaFlags: [] },
  });
  assert.equal(row.source, 'axon-skill-candidate-scout');
  assert.equal(row.project, 'AXON');
  assert.match(row.learning, /\[AXON-SKILL-SCOUT\]/);
  assert.match(row.learning, /1 skill-candidate phrase/);
  assert.match(row.learning, /nothing written to golden_skills/);
}

console.log('axon-skill-candidate-scout-core: all assertions passed.');

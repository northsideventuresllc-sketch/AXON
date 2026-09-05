/**
 * AXON Skill Candidate Scout — pure/testable logic for
 * AX-SMALL-BUILDS-BUNDLE-0904 item (3).
 *
 * Finds phrases JB/agents repeat across recent `session_notes_apartment` rows
 * (and, in future, chat logs — see scripts/axon-skill-candidate-scout.mjs's
 * header for why that source is deliberately left out of v1) and turns
 * repetition into PROPOSALS for a new `golden_skills` candidate — never a
 * write to `golden_skills` itself, never a self-registration. A human (JB or
 * ARCEUS) reads the proposal artifact and decides.
 *
 * Mechanical shingle-frequency heuristic, no LLM call — same "nothing paid
 * without JB" reasoning as axon-arceus-registry-check.mjs and
 * axon-deploy-qa.mjs. This is deliberately crude v1: it will surface some
 * noise and miss some real patterns a model would catch. That trade is
 * intentional — a free, deterministic first pass that a human skims is safer
 * than an unattended paid model call proposing things on its own schedule.
 *
 * All Supabase/fs I/O lives in scripts/axon-skill-candidate-scout.mjs — this
 * file is pure functions only (tests/axon-skill-candidate-scout-core.test.mjs).
 */

const SHINGLE_SIZE = 5;
const MIN_DISTINCT_NOTES = 3;
const MAX_CANDIDATES = 15;
const MAX_ARTIFACT_ENTRIES_KEPT = 20;
const ENTRY_DELIMITER = '\n---\n';

const STOPWORDS = new Set(
  (
    'the a an and or but if then than so to of in on at for with without ' +
    'is are was were be been being it its this that these those as by from ' +
    'not no yes do does did done can could should would will just about into ' +
    'up down out over under again further once here there when where why how ' +
    'all any both each few more most other some such only own same too very ' +
    's t d ll m re ve'
  ).split(' '),
);

/** Words a persona/new-agent ask tends to use — never used to build anything, only to flag it. */
const PERSONA_HINT_RE =
  /\b(need|needs|needed)\b.{0,30}\b(agent|persona|someone)\b|\bnew agent\b|\bnew persona\b|\bdedicated agent\b|\bbuild an agent\b|\bhire\b.{0,20}\bagent\b/i;

function normalizeWords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isLowSignalShingle(words) {
  const contentWords = words.filter((w) => !STOPWORDS.has(w) && w.length > 2);
  return contentWords.length < 3; // needs at least 3 real content words to mean something
}

/**
 * @param {Array<{id:string|number, text:string, created_at?:string}>} notes
 * @returns {{ notesScanned:number, candidates: Array<{phrase:string, distinctNotes:number, exampleNoteId:*}>, personaFlags: Array<{noteId:*, excerpt:string}> }}
 */
export function analyzeNotesForSkillCandidates(notes = []) {
  const shingleToNoteIds = new Map(); // phrase -> Set(noteId)
  const shingleExample = new Map(); // phrase -> noteId of first sighting
  const personaFlags = [];

  for (const note of notes) {
    const text = note?.text || '';
    if (!text) continue;

    if (PERSONA_HINT_RE.test(text)) {
      const m = text.match(PERSONA_HINT_RE);
      const idx = m ? Math.max(0, text.indexOf(m[0]) - 20) : 0;
      personaFlags.push({ noteId: note.id, excerpt: text.slice(idx, idx + 120).trim() });
    }

    const words = normalizeWords(text);
    const seenInThisNote = new Set();
    for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) {
      const slice = words.slice(i, i + SHINGLE_SIZE);
      if (isLowSignalShingle(slice)) continue;
      const phrase = slice.join(' ');
      if (seenInThisNote.has(phrase)) continue; // count distinct NOTES, not repeats within one note
      seenInThisNote.add(phrase);
      if (!shingleToNoteIds.has(phrase)) {
        shingleToNoteIds.set(phrase, new Set());
        shingleExample.set(phrase, note.id);
      }
      shingleToNoteIds.get(phrase).add(note.id);
    }
  }

  const ranked = [...shingleToNoteIds.entries()]
    .map(([phrase, noteIds]) => ({ phrase, distinctNotes: noteIds.size, exampleNoteId: shingleExample.get(phrase) }))
    .filter((c) => c.distinctNotes >= MIN_DISTINCT_NOTES)
    .sort((a, b) => b.distinctNotes - a.distinctNotes)
    .slice(0, MAX_CANDIDATES);

  return { notesScanned: notes.length, candidates: ranked, personaFlags };
}

/** Render one scout run as a self-contained markdown block ("shows its work"). */
export function renderScoutEntry({ dateIso, lookbackDays, result }) {
  const { notesScanned, candidates, personaFlags } = result;
  const lines = [
    `## Skill candidate scout — ${dateIso}`,
    '',
    `Scanned ${notesScanned} session_notes_apartment row(s) from the last ${lookbackDays} day(s).`,
    '',
    '### Skill candidates (proposal only — nothing written to golden_skills)',
    candidates.length
      ? candidates
          .map((c) => `- "${c.phrase}" — repeated across ${c.distinctNotes} distinct note(s), e.g. note ${c.exampleNoteId}`)
          .join('\n')
      : '(no phrase repeated across enough distinct notes this run)',
    '',
    '### Persona needs flagged for ARCEUS (not built here)',
    personaFlags.length
      ? personaFlags.map((p) => `- note ${p.noteId}: "…${p.excerpt}…" — file to ARCEUS`).join('\n')
      : '(none detected this run)',
  ];
  return lines.join('\n').trim();
}

/** Prepend a new entry to the running proposals log, capped like axon-deploy-qa-core.mjs's QA.md. */
export function withNewScoutEntry(existingContent, newEntryMarkdown) {
  const header =
    '# AXON Skill Candidate Proposals\n\nOne entry per scout run — proposals only, never applied automatically. Written by scripts/axon-skill-candidate-scout.mjs (AX-SMALL-BUILDS-BUNDLE-0904).\n';
  const body = (existingContent || '').replace(header, '').trim();
  const priorEntries = body ? body.split(ENTRY_DELIMITER).filter(Boolean) : [];
  const allEntries = [newEntryMarkdown, ...priorEntries].slice(0, MAX_ARTIFACT_ENTRIES_KEPT);
  return `${header}\n${allEntries.join(ENTRY_DELIMITER)}\n`;
}

/** One-line Learnings row summarizing this scout run. */
export function buildScoutLearningRow({ result }) {
  const { candidates, personaFlags, notesScanned } = result;
  return {
    learning:
      `[AXON-SKILL-SCOUT] scanned ${notesScanned} note(s): ${candidates.length} skill-candidate phrase(s), ` +
      `${personaFlags.length} persona-need flag(s) for ARCEUS. Proposal only, nothing written to golden_skills.`,
    source: 'axon-skill-candidate-scout',
    date: new Date().toISOString(),
    category: 'axon-skill-candidate-scout',
    project: 'AXON',
  };
}

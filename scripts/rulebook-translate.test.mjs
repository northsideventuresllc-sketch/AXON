import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseFrontmatter,
  loadUnits,
  selectCanonicalActive,
  renderRulebookBlock,
  spliceIntoTarget,
  extractCurrentBlock,
  firstParagraph,
} from './rulebook-translate.mjs';

const UNIT_A = `---
id: R-TEST-001
title: "Test must rule"
priority: must
kind: rule
status: active
canonical: true
---

This is the body of the must rule. Second line ignored in summary.
`;

const UNIT_B = `---
id: R-TEST-002
title: "Test should rule"
priority: should
kind: rule
status: active
canonical: true
---

This is the should rule body.
`;

const UNIT_RETIRED = `---
id: R-TEST-003
title: "Retired rule"
priority: must
kind: rule
status: superseded
canonical: true
---

Should never appear in the render.
`;

const UNIT_WRAPPED = `---
id: R-TEST-004
title: "Hard-wrapped rule"
priority: must
kind: rule
status: active
canonical: true
---

This first sentence was hard-wrapped by an editor at a fixed column so it
spans several physical lines before the paragraph actually ends with a
period.

A second paragraph that must never appear in the rendered summary.
`;

function makeUnitsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulebook-units-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test('parseFrontmatter splits YAML frontmatter from body', () => {
  const { meta, body } = parseFrontmatter(UNIT_A);
  assert.equal(meta.id, 'R-TEST-001');
  assert.equal(meta.priority, 'must');
  assert.match(body, /must rule/);
});

test('loadUnits reads every .md file in the units dir', () => {
  const dir = makeUnitsDir({ 'a.md': UNIT_A, 'b.md': UNIT_B });
  const units = loadUnits(dir);
  assert.equal(units.length, 2);
  assert.ok(units.every((u) => u.id));
});

test('selectCanonicalActive drops superseded/retired units', () => {
  const dir = makeUnitsDir({ 'a.md': UNIT_A, 'retired.md': UNIT_RETIRED });
  const units = selectCanonicalActive(loadUnits(dir));
  assert.equal(units.length, 1);
  assert.equal(units[0].id, 'R-TEST-001');
});

test('renderRulebookBlock groups by priority and includes both markers', () => {
  const units = selectCanonicalActive(loadUnits(makeUnitsDir({ 'a.md': UNIT_A, 'b.md': UNIT_B })));
  const block = renderRulebookBlock(units);
  assert.match(block, /<!-- RULEBOOK:BEGIN -->/);
  assert.match(block, /<!-- RULEBOOK:END -->/);
  assert.match(block, /### MUST/);
  assert.match(block, /### SHOULD/);
  assert.match(block, /R-TEST-001/);
  assert.match(block, /R-TEST-002/);
  // MUST section must appear before SHOULD
  assert.ok(block.indexOf('### MUST') < block.indexOf('### SHOULD'));
});

test('renderRulebookBlock excludes empty priority groups', () => {
  const units = selectCanonicalActive(loadUnits(makeUnitsDir({ 'a.md': UNIT_A })));
  const block = renderRulebookBlock(units);
  assert.match(block, /### MUST/);
  assert.doesNotMatch(block, /### SHOULD/);
  assert.doesNotMatch(block, /### NICE/);
});

test('spliceIntoTarget creates markers on a file that has none', () => {
  const { content, created } = spliceIntoTarget('# CLAUDE.md\n\nSome existing content.\n', '<!-- RULEBOOK:BEGIN -->\nX\n<!-- RULEBOOK:END -->');
  assert.equal(created, true);
  assert.match(content, /Some existing content/);
  assert.match(content, /RULEBOOK:BEGIN/);
});

test('spliceIntoTarget replaces only the content between existing markers', () => {
  const existing = '# CLAUDE.md\n\nBefore.\n\n<!-- RULEBOOK:BEGIN -->\nOLD STUFF\n<!-- RULEBOOK:END -->\n\nAfter.\n';
  const { content, created } = spliceIntoTarget(existing, '<!-- RULEBOOK:BEGIN -->\nNEW STUFF\n<!-- RULEBOOK:END -->');
  assert.equal(created, false);
  assert.match(content, /Before\./);
  assert.match(content, /After\./);
  assert.match(content, /NEW STUFF/);
  assert.doesNotMatch(content, /OLD STUFF/);
});

test('extractCurrentBlock returns null when there are no markers', () => {
  assert.equal(extractCurrentBlock('no markers here'), null);
});

test('extractCurrentBlock returns the exact block including markers', () => {
  const existing = 'a\n<!-- RULEBOOK:BEGIN -->\nfoo\n<!-- RULEBOOK:END -->\nb';
  const block = extractCurrentBlock(existing);
  assert.match(block, /^<!-- RULEBOOK:BEGIN -->/);
  assert.match(block, /foo/);
});

test('firstParagraph joins hard-wrapped lines instead of truncating at the first newline', () => {
  const { body } = parseFrontmatter(UNIT_WRAPPED);
  const para = firstParagraph(body);
  // The old `body.split('\n')[0]` behavior would cut this mid-sentence,
  // right after "editor at a fixed column so it" with no terminal period.
  assert.equal(
    para,
    'This first sentence was hard-wrapped by an editor at a fixed column so it spans several physical lines before the paragraph actually ends with a period.'
  );
  assert.ok(para.endsWith('.'), 'first paragraph must end at real sentence punctuation, not a hard line-wrap');
  assert.doesNotMatch(para, /second paragraph/);
});

test('renderRulebookBlock does not truncate a hard-wrapped unit mid-sentence', () => {
  const units = selectCanonicalActive(loadUnits(makeUnitsDir({ 'wrapped.md': UNIT_WRAPPED })));
  const block = renderRulebookBlock(units);
  // Regression for the bug COUNCIL GATE rejected northstarswimschool PR #19
  // over: `split('\n')[0]` of the body cut a hard-wrapped first paragraph
  // off mid-sentence in the rendered CLAUDE.md block.
  assert.match(block, /ends with a period\./);
  assert.doesNotMatch(block, /fixed column so it\n/);
  assert.doesNotMatch(block, /second paragraph/);
});

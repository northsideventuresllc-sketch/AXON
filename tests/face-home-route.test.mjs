#!/usr/bin/env node
/**
 * THE FACE is the Dash home screen, not a tab (JB, 2026-09-06).
 *
 * This is a source-shape test: it reads the files rather than rendering anything, so it
 * runs offline in the same `node --test` sweep as the rest of tests/. It exists because the
 * easiest way to undo this change is a one-line edit that nothing else would catch — put
 * the deck back on `/`, or drop `The Face` back into the nav.
 *
 * Run: node tests/face-home-route.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(join(repoRoot, relativePath), 'utf8');

const HOME_PAGE = 'app/(axon-v0)/page.tsx';
const DECK_PAGE = 'app/(axon-v0)/deck/page.tsx';
const FACE_PAGE = 'app/(axon-v0)/face/page.tsx';
const TOP_NAV = 'components/axon-v0/top-nav.tsx';
const FACE_HERO = 'components/axon-v0/face-hero.tsx';

test('the Dash home page renders the Face hero', () => {
  const source = read(HOME_PAGE);
  assert.match(
    source,
    /import\s*\{[^}]*\bFaceHero\b[^}]*\}\s*from\s*'@\/components\/axon-v0\/face-hero'/,
    'app/(axon-v0)/page.tsx must import FaceHero from components/axon-v0/face-hero'
  );
  assert.match(source, /<FaceHero\s*\/>/, 'the home page must actually render <FaceHero />');
  assert.doesNotMatch(source, /HomeDeck/, 'the home deck no longer lives on /');
});

test('the Face hero is a client component and owns the orb', () => {
  const source = read(FACE_HERO);
  assert.match(source, /^'use client';/m, 'the hero touches the DOM, so it must be a client component');
  assert.match(source, /FaceOrbScene/, 'the hero renders the orb scene');
  assert.match(source, /export\s+function\s+FaceHero/, 'FaceHero must be a named export');
});

test('the old home deck is still reachable at /deck', () => {
  const source = read(DECK_PAGE);
  assert.match(source, /HomeDeck/, '/deck must render the untouched home deck');
  assert.match(source, /<HomeDeck\s*\/>/);
});

test('the Face hero carries one quiet link to the deck', () => {
  const source = read(FACE_HERO);
  assert.match(source, /href="\/deck"/, 'the hero needs a way through to the deck');
  const links = source.match(/href="\/deck"/g) ?? [];
  assert.equal(links.length, 1, 'exactly one deck link — the hero stays quiet');
});

test('/face permanently redirects to the home screen', () => {
  const source = read(FACE_PAGE);
  assert.match(source, /permanentRedirect/, '/face must redirect permanently, not temporarily');
  assert.match(source, /from\s*'next\/navigation'/, 'redirect comes from next/navigation');
  assert.match(source, /permanentRedirect\('\/'\)/, '/face must land on /');
  assert.doesNotMatch(source, /FaceOrbScene|FaceHero/, '/face must no longer render the orb itself');
});

test('the top nav has no Face tab and no /face link left in it', () => {
  const source = read(TOP_NAV);
  assert.doesNotMatch(source, /href:\s*'\/face'/, "no nav entry may point at '/face'");
  assert.doesNotMatch(source, /'The Face'/, "the 'The Face' nav label is gone");
  assert.match(source, /href="\/"/, 'the logo link home is how you reach the Face');
  assert.match(source, /data-active=\{pathname === '\/'\}/, 'the home link must highlight on /');
});

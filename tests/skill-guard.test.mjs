#!/usr/bin/env node
/**
 * SKILLS & MCP toggle guard (problem #8) — proves obsidian-vault-write can
 * never be disabled, golden skills need explicit confirmation to disable,
 * and ordinary skills toggle freely either way.
 *
 * assertSkillToggleAllowed is deliberately pure (no I/O) so this file is
 * cheap and needs no Supabase key to run. See tests/agent-bus-loop-guards.test.mjs
 * for the sibling pattern this follows.
 *
 * Run: node tests/skill-guard.test.mjs
 */
import assert from 'node:assert/strict';
import { assertSkillToggleAllowed, HARD_LOCKED_GOLDEN_SKILLS } from '../lib/axon-v0/skill-guard.mjs';

// --- 1. obsidian-vault-write can never be disabled, even with confirmGolden --------------
{
  const r = assertSkillToggleAllowed({
    name: 'obsidian-vault-write',
    isGolden: true,
    nextEnabled: false,
    confirmGolden: true,
  });
  assert.equal(r.allowed, false, 'obsidian-vault-write must never be disabled, confirm or not');
  assert.match(r.reason, /standing order/, 'reason must explain the standing order in plain English');
}

// --- 2. hard lock fires by name alone even if is_golden was (wrongly) false --------------
{
  const r = assertSkillToggleAllowed({
    name: 'obsidian-vault-write',
    isGolden: false,
    nextEnabled: false,
  });
  assert.equal(r.allowed, false, 'the name-based lock must fire independently of the is_golden flag');
}

// --- 3. case/whitespace variants of the locked name are still caught ---------------------
{
  const r = assertSkillToggleAllowed({ name: '  Obsidian-Vault-Write  ', isGolden: true, nextEnabled: false });
  assert.equal(r.allowed, false, 'the lock must be case/whitespace insensitive');
}

// --- 4. any other golden skill requires explicit confirmation to disable -----------------
{
  const withoutConfirm = assertSkillToggleAllowed({ name: 'nvg-operator-core', isGolden: true, nextEnabled: false });
  assert.equal(withoutConfirm.allowed, false, 'a golden skill must refuse to disable without confirmGolden');
  assert.equal(withoutConfirm.requiresConfirm, true, 'must signal that confirmation, not a hard block, is what is missing');

  const withConfirm = assertSkillToggleAllowed({
    name: 'nvg-operator-core',
    isGolden: true,
    nextEnabled: false,
    confirmGolden: true,
  });
  assert.equal(withConfirm.allowed, true, 'a golden (non-hard-locked) skill can be disabled once confirmed');
}

// --- 5. an ordinary, non-golden skill toggles freely either direction --------------------
{
  const off = assertSkillToggleAllowed({ name: 'defuddle', isGolden: false, nextEnabled: false });
  assert.equal(off.allowed, true, 'a non-golden skill must be free to disable');

  const on = assertSkillToggleAllowed({ name: 'defuddle', isGolden: false, nextEnabled: true });
  assert.equal(on.allowed, true, 'enabling any skill is always allowed');
}

// --- 6. enabling a golden skill never needs confirmation (only disabling is the footgun) -
{
  const r = assertSkillToggleAllowed({ name: 'obsidian-vault-write', isGolden: true, nextEnabled: true });
  assert.equal(r.allowed, true, 'turning a golden skill ON needs no confirmation — only turning one off is dangerous');
}

// --- 7. the hard-locked list is exported and contains obsidian-vault-write ---------------
{
  assert.ok(
    HARD_LOCKED_GOLDEN_SKILLS.includes('obsidian-vault-write'),
    'HARD_LOCKED_GOLDEN_SKILLS must list obsidian-vault-write'
  );
}

console.log('skill-guard: all 7 checks passed');

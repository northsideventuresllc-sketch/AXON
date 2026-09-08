/**
 * AXON COMPUTER USE (2026-08-26, re-verified + fixed 2026-09-08) — a real Claude Computer
 * Use agentic loop, executed only on JB's own Mac mini via the existing nvg_mini_jobs relay
 * (lib/nvg-mini-queue.mjs) — the same shared transport axon-router-core.mjs's 'local' lane
 * and the subscription-CLI lanes already use. No third-party computer-use service is
 * involved anywhere in this file; every screenshot/click/type action is a shell command
 * dispatched to hardware we control, and the model never sees or handles a credential (the
 * browser session on the mini is already authenticated).
 *
 * First proving ground: the Match Fit Gemini/Flow video-download task, which has failed
 * repeatedly the old way (NI-Brain Learnings #6796/#6797/#6803/#6983, #7128/#7332/#7333) —
 * see scripts/test-computer-use-video-task.mjs. Per JB: if that test doesn't clear, this
 * capability does not ship further.
 *
 * API SHAPE — CONFIRMED 2026-09-08 (two independent live doc fetches against
 * platform.claude.com, cross-checked against the claude-api skill's platform-availability
 * table): the tool type is `computer_toolset_20260801`, GA, NO beta header, supported on
 * claude-sonnet-5 (used here) among others. It is a CLIENT TOOLSET, not the classic single
 * `computer` tool with an `action` field:
 *   - Declaration takes ONLY `{ type: "computer_toolset_20260801" }` — no `name` field, and
 *     NO display_width_px / display_height_px. The model auto-detects resolution from the
 *     screenshot images you return. (The original 2026-08-27 draft of this file sent
 *     name/display fields that this toolset does not accept, and had no display-resolution
 *     dependency to resolve in the first place — that "flagged dependency" was moot.)
 *   - Claude's tool_use blocks carry the member action directly as `name` (e.g.
 *     "left_click", "screenshot") plus `toolset_name: "computer"` — never a nested
 *     `input.action`.
 *   - Every tool_result for a toolset member must echo `toolset_name: "computer"` alongside
 *     `tool_use_id`, per the docs' "your application's responsibility" section.
 *   - Batch actions run in order; execution halts at the first failure in a turn.
 *
 * DEPENDENCY (a) — cliclick: CONFIRMED LIVE 2026-09-08 via a read-only mini probe —
 * installed and working at ~/.local/bin/cliclick (built from source, no Homebrew on that
 * machine), version 5.1. cliclickCmd() below prefixes PATH on every invocation since the
 * mini's job runner is a launchd-spawned python3 daemon (com.nvg.mini-runner) that does not
 * reliably inherit a login shell's PATH.
 *
 * DEPENDENCY (b) — display resolution env vars: MOOT. See API SHAPE note above — the
 * confirmed toolset does not take a display size at all, so COMPUTER_USE_DISPLAY_WIDTH/
 * HEIGHT (present in the original draft) has been removed entirely rather than kept as dead
 * config.
 *
 * REMAINING REAL BLOCKER — CONFIRMED LIVE 2026-09-08, NOT resolved by this file: the same
 * read-only probe that confirmed cliclick also ran `osascript -e 'tell application "System
 * Events" to get UI elements enabled'` and got back `false`, with cliclick itself printing
 * "WARNING: Accessibility privileges not enabled. Many actions may fail." Screenshots will
 * work; every click/type/key/scroll action will silently no-op until Accessibility
 * permission is granted to the mini runner's actual calling process (System Settings →
 * Privacy & Security → Accessibility) — a physical, hands-on-the-mini step outside anything
 * a code change here can fix. Do not attempt to route around it (e.g. by weakening the
 * credential/scope guardrails in the system prompt below); it must be granted deliberately,
 * on the mini, by JB or whoever has hands on that machine, before the live proving-ground
 * test in scripts/test-computer-use-video-task.mjs can produce a real result.
 *
 * TRANSPORT NOTE: queueMiniShellJob (lib/nvg-mini-queue.mjs) runs every command through
 * classifyMiniShellRisk (lib/nvg-mini-risk-gate.mjs) before it is ever queued — an unmatched
 * shell payload defaults HIGH risk and is blocked, not silently allowed. This file's action
 * commands (screencapture/cliclick/osascript, built by buildActionCommand below) are
 * allowlisted there by name/shape as part of this same change — see that file's
 * ALLOWLISTED_TEMPLATES. Do not bypass that gate from here.
 */

import { loadConfig } from './config.mjs';
import { createSupabaseClient } from './supabase.mjs';
import { queueMiniShellJob } from './nvg-mini-queue.mjs';

const ANTHROPIC_VERSION = '2023-06-01';
const COMPUTER_USE_MODEL = process.env.COMPUTER_USE_MODEL || 'claude-sonnet-5';
const COMPUTER_USE_TOOL_TYPE = 'computer_toolset_20260801';

// TCC-exempt staging path (NI-Brain Learning #6983) — the mini's job runner cannot
// write to ~/Downloads or ~/Desktop (macOS sandboxes it there), so every download this
// capability triggers must land here instead.
const MINI_STAGING_DIR = '/Users/Shared/nvg-media';

const ACTION_TIMEOUT_S = 25;
const ACTION_MAX_WAIT_MS = 40_000;

const MAC_KEY_CODES = {
  return: 36,
  enter: 76,
  tab: 48,
  escape: 53,
  esc: 53,
  space: 49,
  delete: 51,
  backspace: 51,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
};

const MODIFIER_CLAUSES = {
  ctrl: 'control down',
  control: 'control down',
  alt: 'option down',
  option: 'option down',
  shift: 'shift down',
  cmd: 'command down',
  command: 'command down',
  super: 'command down',
  meta: 'command down',
};

/** POSIX-safe single-quote shell escaping. */
function shQuote(str) {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

/**
 * cliclick lives at ~/.local/bin (no Homebrew on the mini — confirmed live 2026-09-08,
 * version 5.1). The mini's job runner is a launchd-spawned python3 daemon with a minimal
 * PATH that won't reliably include a user's ~/.local/bin — so every bare `cliclick` call
 * risks a silent "command not found". Prefixing PATH on each invocation avoids depending on
 * the runner's environment or hardcoding an absolute path that could drift.
 */
function cliclickCmd(args) {
  return `PATH="$HOME/.local/bin:$PATH" cliclick ${args}`;
}

/** AppleScript double-quoted string escaping (nested inside a shell single-quoted -e arg). */
function asString(str) {
  return '"' + String(str).replace(/"/g, '\\"') + '"';
}

function buildKeyCommand(text) {
  const parts = String(text).split('+').map((p) => p.trim().toLowerCase());
  const keyToken = parts.pop();
  const mods = parts.map((p) => MODIFIER_CLAUSES[p]).filter(Boolean);
  const usingClause = mods.length ? ` using {${mods.join(', ')}}` : '';

  if (MAC_KEY_CODES[keyToken] !== undefined) {
    return `osascript -e 'tell application "System Events" to key code ${MAC_KEY_CODES[keyToken]}${usingClause}'`;
  }
  return `osascript -e 'tell application "System Events" to keystroke ${asString(keyToken)}${usingClause}'`;
}

function buildScrollCommand(input) {
  const dir = input?.scroll_direction;
  const amount = Math.max(1, Math.min(20, Number(input?.scroll_amount) || 3));
  const keyName = dir === 'up' ? 'up' : dir === 'down' ? 'down' : dir === 'left' ? 'left' : 'right';
  const code = MAC_KEY_CODES[keyName];
  // Keyboard-based scroll — a reliably-documented AppleScript pattern. cliclick's own
  // wheel-scroll syntax was not independently verified this session, so this avoids
  // guessing at it; swap in a real wheel command later if pixel-perfect scroll matters.
  const presses = Array.from({ length: amount }, () => `key code ${code}`).join('\n');
  return `osascript -e 'tell application "System Events"\n${presses}\nend tell'`;
}

/** Maps one Computer Use toolset member action to a mini shell command. Returns null for
 *  v0-unsupported actions (this build covers the actions the proving-ground task needs;
 *  the toolset has 17 total — middle_click/triple_click/drag/mouse_move/etc. are not yet
 *  wired and report a clean "not implemented" error instead of crashing). */
function buildActionCommand(name, input) {
  switch (name) {
    case 'screenshot': {
      const f = `/tmp/axon-cu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      return { cmd: `screencapture -x -t png ${f} && base64 -i ${f}; rm -f ${f}`, kind: 'computer_screenshot' };
    }
    case 'left_click':
    case 'right_click':
    case 'double_click': {
      const [x, y] = input?.coordinate || [];
      if (typeof x !== 'number' || typeof y !== 'number') {
        throw new Error(`${name} requires a [x, y] coordinate`);
      }
      const prefix = name === 'left_click' ? 'c' : name === 'right_click' ? 'rc' : 'dc';
      return { cmd: cliclickCmd(`${prefix}:${Math.round(x)},${Math.round(y)}`), kind: 'computer_click' };
    }
    case 'type': {
      if (typeof input?.text !== 'string') throw new Error('type requires text');
      return { cmd: cliclickCmd(`t:${shQuote(input.text)}`), kind: 'computer_type' };
    }
    case 'key': {
      if (typeof input?.text !== 'string') throw new Error('key requires text');
      return { cmd: buildKeyCommand(input.text), kind: 'computer_key' };
    }
    case 'scroll':
      return { cmd: buildScrollCommand(input), kind: 'computer_scroll' };
    default:
      return null;
  }
}

/**
 * The confirmed computer_toolset_20260801 shape always carries the member action directly
 * as `name` (e.g. "left_click"), never a nested `input.action` — there is no classic
 * top-level `computer` tool to fall back to since that's the only tool type this file ever
 * declares. See the API SHAPE note at the top of this file.
 */
function resolveAction(block) {
  return { action: block.name, input: block.input || {} };
}

async function callComputerUseModel(apiKey, system, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: COMPUTER_USE_MODEL,
      max_tokens: 2048,
      system,
      messages,
      tools: [{ type: COMPUTER_USE_TOOL_TYPE }],
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Anthropic computer-use HTTP ${r.status}: ${text.slice(0, 500)}`);
  }
  return r.json();
}

async function executeComputerAction(supabaseKey, name, input) {
  if (name === 'wait') {
    const seconds = Math.max(0, Math.min(300, Number(input?.duration) || 1));
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return { content: [{ type: 'text', text: `Waited ${seconds}s` }] };
  }

  let built;
  try {
    built = buildActionCommand(name, input);
  } catch (err) {
    return { is_error: true, content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }] };
  }
  if (!built) {
    return {
      is_error: true,
      content: [{ type: 'text', text: `Action "${name}" is not implemented in this v0 build.` }],
    };
  }

  // queueMiniShellJob is the shared, risk-gated transport (lib/nvg-mini-queue.mjs) — it
  // returns the job's stdout string, or null on any failure/timeout/block. It does not
  // surface stderr separately, so a specific "command not found" diagnosis isn't available
  // here; a null result is reported generically and the loop's own error handling
  // (batchFailed halts the rest of the turn) lets Claude see and react to the failure.
  const stdout = await queueMiniShellJob(supabaseKey, built.cmd, {
    title: `axon-computer-use:${name}`,
    timeoutS: ACTION_TIMEOUT_S,
    maxWaitMs: ACTION_MAX_WAIT_MS,
  });

  if (name === 'screenshot') {
    if (!stdout) {
      return { is_error: true, content: [{ type: 'text', text: 'Screenshot failed, was blocked, or timed out on the mini.' }] };
    }
    return { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: stdout.trim() } }] };
  }
  if (stdout === null) {
    return { is_error: true, content: [{ type: 'text', text: `Action "${name}" failed, was blocked, or timed out on the mini.` }] };
  }
  return { content: [{ type: 'text', text: stdout.trim() || 'OK' }] };
}

async function logRun({ sbInsert, taskDescription, outcome, steps, durationMs, transcript, finalText }) {
  try {
    await sbInsert('Learnings', {
      learning:
        `[COMPUTER-USE] task="${taskDescription.slice(0, 200)}" outcome=${outcome} steps=${steps} ` +
        `duration_ms=${durationMs}\nTranscript: ${JSON.stringify(transcript).slice(0, 4000)}\n` +
        `Final: ${finalText.slice(0, 1000)}`,
      source: 'axon_computer_use',
      category: 'infra',
      project: 'AXON',
    });
  } catch {
    // an audit-write failure must never hide the real result from the caller
  }
}

/**
 * Run a task through the Computer Use agentic loop on the mini.
 * @param {{ taskDescription: string, systemNote?: string, maxSteps?: number, timeoutMs?: number }} opts
 * @returns {Promise<{ outcome: 'complete'|'max_steps_exceeded'|'timeout'|'error', steps: number, durationMs: number, finalText: string, transcript: Array }>}
 */
export async function runComputerUseTask({
  taskDescription,
  systemNote = '',
  maxSteps = 25,
  timeoutMs = 15 * 60_000,
}) {
  if (!taskDescription?.trim()) throw new Error('taskDescription is required');

  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const { sbSelect, sbInsert } = createSupabaseClient(supabaseKey);
  const cfg = await loadConfig(sbSelect);

  const system = [
    "You control a real macOS machine (JB's Mac mini) via screenshots and mouse/keyboard actions.",
    'The browser on this machine is already authenticated as the operator — never navigate to a',
    'login or password entry screen, and never type a password or API key as part of this task.',
    `Save any file this task downloads to ${MINI_STAGING_DIR} — that is the only writable staging`,
    'path on this machine; ~/Downloads and ~/Desktop are not writable here.',
    'Take a screenshot before your first action to see the current screen, and again after any',
    'action that changes the screen, so you can verify the result before continuing. When the',
    'task is fully complete, reply with a plain-text summary and make no further tool calls.',
    systemNote,
  ]
    .filter(Boolean)
    .join('\n');

  const messages = [{ role: 'user', content: taskDescription.trim() }];
  const transcript = [];
  const startedAt = Date.now();
  let steps = 0;
  let outcome = 'unknown';
  let finalText = '';

  try {
    while (steps < maxSteps) {
      if (Date.now() - startedAt > timeoutMs) {
        outcome = 'timeout';
        break;
      }
      steps++;

      const response = await callComputerUseModel(cfg.anthropicKey, system, messages);
      messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks = (response.content || []).filter((b) => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) {
        finalText = (response.content || [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        outcome = 'complete';
        break;
      }

      const toolResults = [];
      let batchFailed = false;
      for (const block of toolUseBlocks) {
        if (batchFailed) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            toolset_name: 'computer',
            is_error: true,
            content: 'Not executed: an earlier action in this turn failed.',
          });
          continue;
        }
        const { action, input } = resolveAction(block);
        const result = await executeComputerAction(supabaseKey, action, input);
        transcript.push({ step: steps, action, input, error: !!result.is_error });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          toolset_name: 'computer',
          ...(result.is_error ? { is_error: true } : {}),
          content: result.content,
        });
        if (result.is_error) batchFailed = true;
      }
      messages.push({ role: 'user', content: toolResults });
    }
    if (outcome === 'unknown') outcome = 'max_steps_exceeded';
  } catch (err) {
    outcome = 'error';
    finalText = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - startedAt;
  await logRun({ sbInsert, taskDescription, outcome, steps, durationMs, transcript, finalText });

  return { outcome, steps, durationMs, finalText, transcript };
}

/**
 * AXON COMPUTER USE (2026-08-26) — a real Claude Computer Use agentic loop, executed
 * only on JB's own Mac mini via the existing nvg_mini_jobs relay (lib/axon-mini-relay.mjs)
 * — the same channel axon-local-relay.mjs already uses for Ollama calls. No third-party
 * computer-use service is involved anywhere in this file; every screenshot/click/type
 * action is a shell command dispatched to hardware we control, and the model never sees
 * or handles a credential (the browser session on the mini is already authenticated).
 *
 * First proving ground: the Match Fit Gemini/Flow video-download task, which has failed
 * repeatedly the old way (NI-Brain Learnings #6796/#6797/#6803/#6983, #7128/#7332/#7333) —
 * see scripts/test-computer-use-video-task.mjs. Per JB: if that test doesn't clear, this
 * capability does not ship further.
 *
 * HONESTY NOTE ON THE API SHAPE: the tool type string below (`computer_toolset_20260801`,
 * GA, no beta header) was cross-checked across two independent doc lookups this session.
 * The exact tool_use/name shape for the current generation was NOT fully verified (one
 * source described a "toolset" where every action is its own top-level tool name; the
 * long-documented shape is a single `computer` tool whose `input.action` selects the
 * action) — resolveAction() below handles BOTH shapes so this doesn't have to be guessed
 * correctly to work. If the first real call errors on the `tools` shape, that's the one
 * thing to check against https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
 * before touching anything else in this file.
 *
 * HONESTY NOTE ON DISPLAY SIZE: COMPUTER_USE_DISPLAY_WIDTH/HEIGHT below default to
 * 1920x1080 — this MUST match the mini's actual screen resolution or every click lands
 * in the wrong place, because Claude reasons about coordinates in whatever space it's
 * told the display is. Confirm the mini's real resolution and set the env vars before
 * the first real run.
 *
 * DEPENDENCY: click/type actions shell out to `cliclick` on the mini
 * (`brew install cliclick`) — not installed by this code, flagged to JB. Scroll and key
 * combos use AppleScript/System Events instead, which ships with macOS.
 */

import { loadConfig } from './config.mjs';
import { createSupabaseClient } from './supabase.mjs';
import { enqueueMiniShellJob, pollMiniJob } from './axon-mini-relay.mjs';

const ANTHROPIC_VERSION = '2023-06-01';
const COMPUTER_USE_MODEL = process.env.COMPUTER_USE_MODEL || 'claude-sonnet-5';
const COMPUTER_USE_TOOL_TYPE = 'computer_toolset_20260801';
const COMPUTER_USE_DISPLAY = {
  width: Number(process.env.COMPUTER_USE_DISPLAY_WIDTH) || 1920,
  height: Number(process.env.COMPUTER_USE_DISPLAY_HEIGHT) || 1080,
};

// TCC-exempt staging path (NI-Brain Learning #6983) — the mini's job runner cannot
// write to ~/Downloads or ~/Desktop (macOS sandboxes it there), so every download this
// capability triggers must land here instead.
const MINI_STAGING_DIR = '/Users/Shared/nvg-media';

const ACTION_TIMEOUT_S = 25;
const ACTION_MAX_WAIT_MS = 40_000;
const ACTION_POLL_MS = 2_000;

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

/** Maps one Computer Use action to a mini shell command. Returns null for v0-unsupported actions. */
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
      return { cmd: `cliclick ${prefix}:${Math.round(x)},${Math.round(y)}`, kind: 'computer_click' };
    }
    case 'type': {
      if (typeof input?.text !== 'string') throw new Error('type requires text');
      return { cmd: `cliclick t:${shQuote(input.text)}`, kind: 'computer_type' };
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
 * Normalizes a tool_use block to {action, input} regardless of whether the API returns
 * the classic single `computer` tool (action selected via input.action) or a toolset
 * where each action is its own top-level tool name — see the honesty note up top.
 */
function resolveAction(block) {
  if (block.name === 'computer' && block.input && typeof block.input.action === 'string') {
    const { action, ...rest } = block.input;
    return { action, input: rest };
  }
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
      tools: [
        {
          type: COMPUTER_USE_TOOL_TYPE,
          name: 'computer',
          display_width_px: COMPUTER_USE_DISPLAY.width,
          display_height_px: COMPUTER_USE_DISPLAY.height,
        },
      ],
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

  const jobId = await enqueueMiniShellJob(supabaseKey, {
    title: `axon-computer-use:${name}`,
    cmd: built.cmd,
    timeout: ACTION_TIMEOUT_S,
    kind: built.kind,
  });
  if (!jobId) {
    return { is_error: true, content: [{ type: 'text', text: 'Could not reach the mini job queue.' }] };
  }

  const outcome = await pollMiniJob(supabaseKey, jobId, { maxWaitMs: ACTION_MAX_WAIT_MS, pollMs: ACTION_POLL_MS });
  if (outcome.status !== 'done') {
    return { is_error: true, content: [{ type: 'text', text: `Action "${name}" ${outcome.status} on the mini.` }] };
  }

  const stdout = String(outcome.result?.stdout || '').trim();
  const stderr = String(outcome.result?.stderr || '').trim();

  if (name === 'screenshot') {
    if (!stdout) {
      return { is_error: true, content: [{ type: 'text', text: `Screenshot failed: ${stderr || 'no output'}` }] };
    }
    return { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: stdout } }] };
  }
  if (stderr && /command not found/i.test(stderr)) {
    return { is_error: true, content: [{ type: 'text', text: `Tool missing on the mini: ${stderr}` }] };
  }
  return { content: [{ type: 'text', text: stdout || 'OK' }] };
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

#!/usr/bin/env node
/**
 * axon-airllm-bench.mjs — AXON-AIRLLM-BENCH-0817
 *
 * Ponder run 8 finding: does AirLLM (layer-by-layer loading) let the Mac mini run a
 * 7-8B model that wouldn't otherwise fit, and is it actually usable — a real timing
 * comparison, not just "it installed"?
 *
 * WHY THIS EXISTS (see agent_dispatch code AXON-AIRLLM-BENCH-0817, full history there):
 * two prior passes found real, current disk pressure on the mini (down to ~3GB free
 * after installing base ML deps alone, before any model download) and no
 * ANTHROPIC_API_KEY on the mini for a Claude-side timing leg. This script fixes both
 * gaps in the plan: (1) it refuses to run past a disk floor instead of finding out the
 * hard way, and (2) it uses the mini's own Claude *subscription* CLI shape
 * (`claude -p '...'`, already allowlisted for autonomous mini execution — see
 * lib/nvg-mini-risk-gate.mjs ALLOWLISTED_TEMPLATES 'subscription-cli-claude') for the
 * comparison leg instead of a paid per-token API call, which this ticket's own
 * "no paid GPU / free-tiers-first" constraint (Decision #2001) would otherwise forbid.
 *
 * This file does NOT itself download a model or call AirLLM — it is the runbook's
 * executable half, meant to be run ON the Mac mini (or via nvg_mini_jobs) once disk is
 * confirmed clear. See the companion runbook:
 * nv-vault "Workflows & SOPs/AirLLM vs Claude Subscription CLI — Benchmark Runbook.md"
 * for the exact one-off approval + apply steps (this is BUILD, not JB, work once disk
 * is free — no code change needed to run it, just execution on hardware this session
 * cannot reach).
 *
 * Usage (on the mini):
 *   node scripts/axon-airllm-bench.mjs --model <hf-repo-or-quant-path> [--min-free-gb 6]
 *     [--prompts-file ./bench-prompts.json] [--out ./airllm-bench-result.json]
 *
 * Exit codes: 0 = ran and wrote a result; 2 = refused (disk floor not met, or a
 * required binary is missing) — never partial-runs past a disk check that failed.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';

const execFileP = promisify(execFile);

export const DEFAULT_MIN_FREE_GB = 6;
export const DEFAULT_PROMPTS = [
  'In one sentence, what is Match Fit?',
  'Name the operator of Northside Ventures using just initials.',
  'Write a one-line changelog entry for a bug fix in the outreach pipeline.',
  'Summarize, in one sentence, what AXON is.',
  'Reply with exactly one word: ready',
];

/**
 * Parse `df -h /` output into free bytes on the root volume. Pure — takes the raw
 * command output so it is unit-testable without touching the real filesystem.
 * @param {string} dfOutput
 * @returns {number} free space in GB (decimal, i.e. 1 GB = 1e9 bytes), or NaN if unparsable.
 */
export function parseDfFreeGb(dfOutput) {
  const lines = String(dfOutput).trim().split('\n');
  if (lines.length < 2) return NaN;
  const cols = lines[1].trim().split(/\s+/);
  // macOS `df -h`: Filesystem Size Used Avail Capacity iused ifree %iused Mounted-on
  const avail = cols[3];
  if (!avail) return NaN;
  const m = /^([\d.]+)([KMGT]?i?)$/.exec(avail);
  if (!m) return NaN;
  const num = parseFloat(m[1]);
  const unit = m[2].replace('i', '').toUpperCase();
  const mult = { '': 1 / 1e9, K: 1e3 / 1e9, M: 1e6 / 1e9, G: 1, T: 1e3 }[unit];
  return mult === undefined ? NaN : num * mult;
}

/** Real disk-space check. Wraps `df -h /`; guarded so a shell failure reads as 0 free, never "unknown = proceed". */
export async function getFreeDiskGb(opts = {}) {
  const runner = opts.execFileImpl || execFileP;
  try {
    const { stdout } = await runner('df', ['-h', '/']);
    const gb = parseDfFreeGb(stdout);
    return Number.isFinite(gb) ? gb : 0;
  } catch {
    return 0;
  }
}

/**
 * Time one `claude -p '<prompt>'` subscription-CLI call. Uses the mini's existing
 * Claude subscription (not a billed API key) — the exact shape already allowlisted in
 * lib/nvg-mini-risk-gate.mjs, so this is safe to queue via nvg_mini_jobs too, not only
 * run directly.
 */
export async function timeClaudeSubscriptionCall(prompt, opts = {}) {
  const runner = opts.execFileImpl || execFileP;
  const t0 = Date.now();
  try {
    const { stdout } = await runner('claude', ['-p', prompt], { timeout: opts.timeoutMs ?? 60000 });
    return { ok: true, ms: Date.now() - t0, output: String(stdout).trim().slice(0, 2000) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message };
  }
}

/**
 * Time one AirLLM layer-by-layer load+generate call. AirLLM's Python API
 * (`from airllm import AutoModel`) has no stable Node binding, so this shells out to a
 * small inline python3 script — same "self-contained payload, no new repo file needed
 * on the mini" pattern as nv-vault's mini-cron-manifest-sync.mjs. Requires `airllm` and
 * (on macOS) `mlx` already installed — see the runbook's pip-install step; this
 * function does not install anything itself.
 */
export async function timeAirllmCall(model, prompt, opts = {}) {
  const runner = opts.execFileImpl || execFileP;
  const py = `import time, sys
from airllm import AutoModel
t0 = time.time()
model = AutoModel.from_pretrained(${JSON.stringify(model)})
t_load = time.time() - t0
input_ids = model.tokenizer(${JSON.stringify(prompt)}, return_tensors="pt").input_ids
t1 = time.time()
out = model.generate(input_ids, max_new_tokens=64)
t_gen = time.time() - t1
text = model.tokenizer.decode(out[0], skip_special_tokens=True)
print(__import__('json').dumps({"load_s": t_load, "gen_s": t_gen, "text": text[:2000]}))
`;
  const t0 = Date.now();
  try {
    const { stdout } = await runner('python3', ['-c', py], { timeout: opts.timeoutMs ?? 600000 });
    const parsed = JSON.parse(String(stdout).trim().split('\n').pop());
    return { ok: true, ms: Date.now() - t0, ...parsed };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message };
  }
}

/**
 * Build the final comparison record from raw per-call timings. Pure — no I/O — so the
 * report shape is unit-testable without a live mini/model.
 */
export function buildComparisonReport({ model, minFreeGb, freeDiskGbAtStart, airllm, claudeCli }) {
  // Only successful calls count toward the average — a failed call's elapsed time (e.g.
  // an OOM after 30s) is not a real latency number and must never make a failing side
  // look "fast".
  const airllmMsList = airllm.filter((r) => r.ok).map((r) => r.ms).filter((n) => Number.isFinite(n));
  const claudeMsList = claudeCli.filter((r) => r.ok).map((r) => r.ms).filter((n) => Number.isFinite(n));
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  return {
    generated_at: new Date().toISOString(),
    model,
    disk: { min_free_gb_required: minFreeGb, free_gb_at_start: freeDiskGbAtStart },
    airllm: {
      n: airllm.length,
      n_ok: airllm.filter((r) => r.ok).length,
      avg_ms: avg(airllmMsList),
      results: airllm,
    },
    claude_subscription_cli: {
      n: claudeCli.length,
      n_ok: claudeCli.filter((r) => r.ok).length,
      avg_ms: avg(claudeMsList),
      results: claudeCli,
    },
    verdict:
      avg(airllmMsList) === null || avg(claudeMsList) === null
        ? 'incomplete — one side produced no successful calls, no verdict possible'
        : avg(airllmMsList) <= avg(claudeMsList)
          ? `AirLLM local (avg ${avg(airllmMsList)}ms) is faster than the Claude subscription CLI (avg ${avg(claudeMsList)}ms) for this prompt set`
          : `Claude subscription CLI (avg ${avg(claudeMsList)}ms) is faster than AirLLM local (avg ${avg(airllmMsList)}ms) for this prompt set`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 ? args[i + 1] : def;
  };
  const model = getArg('model');
  const minFreeGb = Number(getArg('min-free-gb', DEFAULT_MIN_FREE_GB));
  const outPath = getArg('out', './airllm-bench-result.json');

  if (!model) {
    console.error('FATAL: --model <hf-repo-or-quant-path> is required (a disk-fitting quantized 7-8B build).');
    process.exitCode = 2;
    return;
  }

  const freeGb = await getFreeDiskGb();
  console.error(`Disk check: ${freeGb.toFixed(1)}GB free (floor: ${minFreeGb}GB).`);
  if (freeGb < minFreeGb) {
    console.error(
      `REFUSING to run: below the ${minFreeGb}GB floor. Free space first (do not delete live Ollama models without confirming nothing references them) or raise --min-free-gb only if a human has verified real headroom.`,
    );
    process.exitCode = 2;
    return;
  }

  const prompts = DEFAULT_PROMPTS;
  const airllmResults = [];
  const claudeResults = [];
  for (const p of prompts) {
    airllmResults.push(await timeAirllmCall(model, p));
    claudeResults.push(await timeClaudeSubscriptionCall(p));
  }

  const report = buildComparisonReport({
    model,
    minFreeGb,
    freeDiskGbAtStart: freeGb,
    airllm: airllmResults,
    claudeCli: claudeResults,
  });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${outPath}. Verdict: ${report.verdict}`);
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('axon-airllm-bench.mjs');
if (isDirectRun) {
  main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exitCode = 1;
  });
}

/**
 * A9 — pure 5-field cron parser, extracted out of lib/axon-cron-jobs.ts so it
 * can be unit-tested directly with plain `node --test` (no TS loader needed).
 * `axon-cron-jobs.ts` re-exports both functions unchanged — every existing
 * import of `estimateNextRunUtc` from that file keeps working as-is.
 */

/** True when a single cron field (a wildcard, a step, a list, or a range) matches value. */
export function matchCronField(field, value) {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    return step > 0 && value % step === 0;
  }
  return field.split(',').some((part) => {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      return value >= a && value <= b;
    }
    return Number(part) === value;
  });
}

/** Rough next-run estimate from a standard 5-field cron string (UTC). Returns null when no schedule. */
export function estimateNextRunUtc(cronUtc, from = new Date()) {
  if (!cronUtc) return null;
  const parts = cronUtc.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const [minField, hourField, , , dowField] = parts;
  const start = new Date(from.getTime() + 60_000);

  for (let i = 0; i < 60 * 24 * 14; i++) {
    const d = new Date(start.getTime() + i * 60_000);
    const min = d.getUTCMinutes();
    const hour = d.getUTCHours();
    const dow = d.getUTCDay();

    if (!matchCronField(minField, min)) continue;
    if (!matchCronField(hourField, hour)) continue;
    if (dowField !== '*' && !matchCronField(dowField, dow)) continue;
    return d;
  }
  return null;
}

/**
 * A3/A4-merge — earliest next-run estimate across every cron string a job carries
 * (a roster row's wake_config.cron can be an array, e.g. hermes-agent-dispatch's two
 * daily fires). Lives here next to estimateNextRunUtc so both pure cron-math
 * functions stay in one Node-20-loadable .mjs module.
 */
export function estimateNextRunUtcMulti(cronUtcList, from = new Date()) {
  let earliest = null;
  for (const cronUtc of cronUtcList) {
    const next = estimateNextRunUtc(cronUtc, from);
    if (next && (!earliest || next < earliest)) earliest = next;
  }
  return earliest;
}

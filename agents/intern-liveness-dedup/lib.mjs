// AXON Intern Agent: Liveness Dedup Auditor
// Role: read-only triage of agent_dispatch rows produced by liveness alerts
// (codes LIVE-* / LOOP-LIVE-*). It NEVER writes to agent_dispatch. Its only
// output is a structured report meant for agent_bus, so a human/BUILD agent
// can decide what to collapse. This bounded, read-only contract is what
// makes it "hard to mess up": worst case is a bad report, never data loss.

const TRIGGER_RE = /trig_[A-Za-z0-9]+/;

/**
 * Derive a stable dedup signature for one dispatch row produced by a
 * liveness alert. Signature = <trigger_or_source_id>::<alert_suffix>
 * e.g. "trig_01FW1Z8njCLotxtwzVDo5g2x::NOT-ENABLED"
 */
export function signatureFor(row) {
  const code = row.code || '';
  const trigMatch = code.match(TRIGGER_RE);
  const sourceId = trigMatch ? trigMatch[0] : code.replace(/^(LOOP-)?LIVE-/, '').replace(/-[A-Z-]+$/, '');

  // Alert suffix: trailing ALL-CAPS-WITH-DASHES token(s), e.g. NOT-ENABLED,
  // NEXT-RUN-IN-PAST, QUIET-OVER-2-INTERVALS, LATE, ABANDONED-RUNS.
  const suffixMatch = code.match(/-([A-Z0-9]+(?:-[A-Z0-9]+)*)$/);
  const alertType = suffixMatch ? suffixMatch[1] : 'UNKNOWN';

  return `${sourceId}::${alertType}`;
}

/**
 * Group queued liveness-alert dispatch rows by signature. Within each group,
 * the earliest-created row is canonical; every later row is a duplicate
 * candidate recommended for collapse (report only — no mutation).
 *
 * @param {Array<{id:string, code:string, status:string, owner:string, created_at:string}>} rows
 * @returns {{
 *   scanned: number,
 *   groups_total: number,
 *   duplicate_groups: number,
 *   duplicate_row_count: number,
 *   groups: Array<{signature:string, canonical_id:string, canonical_code:string, duplicate_ids:string[], count:number}>
 * }}
 */
export function analyze(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!row || !row.code) continue;
    const sig = signatureFor(row);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(row);
  }

  const groupReports = [];
  let duplicateRowCount = 0;

  for (const [signature, members] of groups.entries()) {
    const sorted = [...members].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    if (duplicates.length > 0) {
      duplicateRowCount += duplicates.length;
      groupReports.push({
        signature,
        canonical_id: canonical.id,
        canonical_code: canonical.code,
        duplicate_ids: duplicates.map((d) => d.id),
        count: sorted.length,
      });
    }
  }

  // Largest duplicate clusters first — most noise-reduction value up top.
  groupReports.sort((a, b) => b.count - a.count);

  return {
    scanned: rows.length,
    groups_total: groups.size,
    duplicate_groups: groupReports.length,
    duplicate_row_count: duplicateRowCount,
    groups: groupReports,
  };
}

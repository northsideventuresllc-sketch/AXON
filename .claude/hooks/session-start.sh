#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote) sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install

echo "[session-start] NVG BOOT CONTRACT v2 (2026-09-02) — identical in every repo and every routine"
echo "[session-start] 1. Invoke skill nvg-operator-core — binding law. If it fails to load: stop, say so, assert nothing."
echo "[session-start] 2. select * from v_boot; on NI-Brain kxijunwgbrlfzvgkhklo — live rules, switches, open jobs, health. The one door."

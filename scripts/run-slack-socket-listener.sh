#!/usr/bin/env bash
# Wrapper for scripts/slack-socket-listener.mjs — REALTIME-AGENT-SLACK-BUS-0817.
# Sources the mini's env files (same convention as scripts/axon-promote-canary-model.sh)
# so SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY reach the listener without ever
# putting a secret in the launchd plist or in git.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AXON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${HERMES_HOME:-$HOME/.hermes}/logs"
mkdir -p "$LOG_DIR"

[[ -f "${HERMES_HOME:-$HOME/.hermes}/.env" ]] && set -a && source "${HERMES_HOME:-$HOME/.hermes}/.env" && set +a
[[ -f "$HOME/.nv/env" ]] && set -a && source "$HOME/.nv/env" && set +a

if [[ -z "${SUPABASE_SERVICE_KEY:-}${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "[run-slack-socket-listener] ERROR: SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) not found in ${HERMES_HOME:-$HOME/.hermes}/.env or $HOME/.nv/env" >&2
  exit 1
fi

cd "$AXON_DIR"
exec node scripts/slack-socket-listener.mjs

#!/usr/bin/env bash
# Install launchd job to keep the Slack Socket Mode listener (REALTIME-AGENT-SLACK-BUS-0817)
# running persistently on the Mac mini, restarting it if it ever exits.
# Usage: ./scripts/install-axon-slack-listener-launchd.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AXON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_SRC="$SCRIPT_DIR/launchd/com.nv.axon-slack-listener.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.nv.axon-slack-listener.plist"
LOG_DIR="${HERMES_HOME:-$HOME/.hermes}/logs"

mkdir -p "$LOG_DIR"
chmod +x "$SCRIPT_DIR/run-slack-socket-listener.sh"

# Patch the AXON repo path into the plist (same pattern as install-hermes-launchd.sh)
sed -e "s|__AXON_PATH__|$AXON_DIR|g" -e "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/com.nv.axon-slack-listener" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/com.nv.axon-slack-listener"
launchctl kickstart -k "gui/$(id -u)/com.nv.axon-slack-listener"

echo "✅ Installed com.nv.axon-slack-listener"
echo "   Logs: $LOG_DIR/axon-slack-listener.std{out,err}.log"
echo "   Stop for good: launchctl bootout gui/$(id -u)/com.nv.axon-slack-listener && rm $PLIST_DST"
echo "   (KeepAlive is on — a plain SIGTERM/kill just gets relaunched; bootout is the real stop.)"

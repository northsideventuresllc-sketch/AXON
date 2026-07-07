#!/usr/bin/env bash
# Push synced northside-intelligence changes using NI_GITHUB_PAT.
# Usage: scripts/push-ni-portal.sh /path/to/northside-intelligence [branch]
set -euo pipefail

NI_ROOT="${1:?Usage: push-ni-portal.sh /path/to/northside-intelligence [branch]}"
BRANCH="${2:-main}"

if [ -z "${NI_GITHUB_PAT:-}" ]; then
  echo "NI_GITHUB_PAT is not set. Add it to AXON Actions secrets or Cursor Cloud Environment." >&2
  exit 1
fi

cd "$NI_ROOT"
git config user.name "Cursor Agent"
git config user.email "cursoragent@cursor.com"
git add -A

if git diff --staged --quiet; then
  echo "No portal changes to push."
  exit 0
fi

git commit -m "chore(axon): sync embedded UI from AXON repo

Automated portal sync from northsideventuresllc-sketch/AXON."

git push "https://x-access-token:${NI_GITHUB_PAT}@github.com/northsideventuresllc-sketch/northside-intelligence.git" "HEAD:${BRANCH}"
echo "Pushed to northside-intelligence ${BRANCH}"

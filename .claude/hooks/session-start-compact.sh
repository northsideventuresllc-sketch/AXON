#!/bin/bash
# SessionStart hook, matcher "compact" — deterministic post-compaction reminder.
#
# WHY THIS EXISTS: Claude Code caps how much skill content gets re-injected
# after compaction (see .claude/skills/skill-decipher/SKILL.md — golden
# skills can be silently evicted once the mandatory list grows past the
# cap). skill-decipher's own mitigation was itself a skill: an instruction
# telling the model to check for missing instructions, competing for the
# exact resource under pressure. If skill-decipher itself got evicted, the
# safety net was gone too.
#
# This hook is not a skill. It is executed by the harness on every
# compaction-resume, not by the model choosing to read something, so it
# cannot be silently dropped the same way skill content can. Its stdout is
# added to context on resume — confirmed via Claude Code's documented
# "Re-inject context after compaction" SessionStart(compact) mechanism.
# It is a stronger guarantee than a skill, though not as strong as
# CLAUDE.md (the only mechanism Claude Code documents as fully guaranteed
# to survive compaction, since it is re-read from disk).
set -euo pipefail

cat <<'EOF'
COMPACTION-RESUME CHECK (harness-enforced hook, not a skill instruction):
Before your first substantive reply this turn:
1. Query Supabase kxijunwgbrlfzvgkhklo: select skill_name from golden_skills where status='active';
2. Compare that list against what is visibly loaded in your context right now.
3. Re-invoke any golden skill missing from context, in order.
4. State in one line what was re-invoked (or "all golden skills present, none re-invoked").
Do not skip this because it looks like a duplicate of something done before compaction — memory of a prior turn is not proof of current state (see nvg-operator-core, staleness rule).
EOF

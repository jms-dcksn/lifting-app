#!/usr/bin/env bash
# Stop hook: if HEAD is not named in .claude/LAST_SESSION.md, block the turn
# and ask for the close-session skill (docs refresh + session handoff).
#
# Quiet when this commit is already recorded. Uncommitted work does not block;
# close-session still records a dirty tree when it runs.
set -euo pipefail

input=$(cat)

# Avoid infinite loops: Claude Code caps consecutive Stop blocks and sets this flag.
if printf '%s' "$input" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

head=$(git rev-parse HEAD 2>/dev/null) || exit 0
summary=".claude/LAST_SESSION.md"

# Already recorded -> nothing committed since last summary -> let the turn end.
if [ -f "$summary" ] && grep -q "$head" "$summary"; then
  exit 0
fi

reason="HEAD ${head} is not recorded in .claude/LAST_SESSION.md. Run the close-session skill: refresh the owning docs for this session, then overwrite .claude/LAST_SESSION.md so it describes the work, checks, and tree, and includes the exact line 'Commit: ${head}'. Then you may stop."

jq -n --arg r "$reason" '{decision:"block", reason:$r}'
exit 0

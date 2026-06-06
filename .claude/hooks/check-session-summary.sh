#!/usr/bin/env bash
# Stop hook (targeted safety net): if the latest commit isn't reflected in
# .claude/LAST_SESSION.md, block the turn from ending and ask to run the
# session-summary step of the ship-phase skill.
#
# Quiet on non-build turns: if no new commit since the summary was last
# written, HEAD is already referenced in the summary and this exits silently.
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

reason="You have committed work (HEAD ${head}) that is not yet recorded in .claude/LAST_SESSION.md. Run step 5 of the ship-phase skill: overwrite .claude/LAST_SESSION.md to describe this session and include the exact line 'Commit: ${head}'. Then you may stop."

jq -n --arg r "$reason" '{decision:"block", reason:$r}'
exit 0

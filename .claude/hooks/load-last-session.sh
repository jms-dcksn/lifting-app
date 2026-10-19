#!/usr/bin/env bash
# Claude-only optional context; fresh clones need no local handoff.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
summary=".claude/LAST_SESSION.md"
[ -f "$summary" ] || exit 0
head=$(git rev-parse HEAD 2>/dev/null) || exit 0
branch=$(git symbolic-ref --short -q HEAD) || branch="DETACHED"

grep -Fxq "Commit: $head" "$summary" || exit 0
grep -Fxq "Branch: $branch" "$summary" || exit 0
echo "Optional local continuity note; verify claims against the current working tree:"
echo
cat "$summary"

exit 0

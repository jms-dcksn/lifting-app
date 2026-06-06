#!/usr/bin/env bash
# SessionStart hook: inject last session's summary into context for continuity.
# stdout on exit 0 is added to Claude's context.
set -euo pipefail

summary="${CLAUDE_PROJECT_DIR:-.}/.claude/LAST_SESSION.md"

if [ -f "$summary" ]; then
  echo "Auto-loaded continuity note from the previous session (.claude/LAST_SESSION.md):"
  echo
  cat "$summary"
fi

exit 0

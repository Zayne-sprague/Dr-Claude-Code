#!/bin/bash
# PostToolUse hook: Run ruff check on edited Python files
# Receives JSON on stdin from Claude Code

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Only check .py files
[[ "$file_path" != *.py ]] && exit 0

# Skip if ruff not available
command -v ruff &>/dev/null || exit 0

# Skip test files and __init__.py (less strict)
basename=$(basename "$file_path")
[[ "$basename" == "__init__.py" ]] && exit 0

# Run ruff (informational only, doesn't block)
output=$(ruff check "$file_path" --no-fix 2>/dev/null | head -10)

if [[ -n "$output" ]]; then
  # Count issues
  count=$(echo "$output" | grep -c "^$file_path")
  escaped=$(echo "$output" | jq -Rs .)
  echo "{\"decision\":\"approve\",\"reason\":\"ruff found $count issue(s) in $(basename "$file_path"). Consider fixing: $escaped\"}"
fi

exit 0

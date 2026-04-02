#!/bin/bash
# PreToolUse hook: Prevent pushing public_projects/ without user approval
# Receives JSON on stdin from Claude Code

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Only check Bash tool
[[ "$tool_name" != "Bash" ]] && exit 0

# Only check git push commands
echo "$command" | grep -qE 'git\s+push' || exit 0

# Block if cwd is inside public_projects/
cwd=$(echo "$input" | jq -r '.cwd // empty')
if [[ "$cwd" == *"public_projects"* ]]; then
  echo '{"decision":"block","reason":"BLOCKED: public_projects/ contains public-facing code. Get explicit user approval before pushing."}'
  exit 0
fi

exit 0

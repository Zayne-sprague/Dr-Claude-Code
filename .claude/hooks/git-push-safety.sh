#!/bin/bash
# PreToolUse hook: Block dangerous git push patterns
# Receives JSON on stdin from Claude Code

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Only check Bash tool
[[ "$tool_name" != "Bash" ]] && exit 0

# Only check git push commands
echo "$command" | grep -qE 'git\s+push' || exit 0

# Block pushes to upstream (forked repos)
if echo "$command" | grep -qE 'push\s+upstream'; then
  echo '{"decision":"block","reason":"BLOCKED: Never push to upstream remotes. Use origin (our fork) instead."}'
  exit 0
fi

# Warn about force pushes — require explicit user confirmation
if echo "$command" | grep -qE 'push\s+(-f|--force)'; then
  echo '{"decision":"block","reason":"BLOCKED: Force push detected. Please confirm with the user before force pushing."}'
  exit 0
fi

exit 0

#!/usr/bin/env bash
# Sync experiment data to the live dashboard.
# Usage: ./scripts/sync_dashboard.sh
#
# 1. Imports local experiment files → HF dataset
# 2. Tells the live Space to refresh its cache
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Importing experiments to HF ==="
python3 "$SCRIPT_DIR/import_experiments.py"

echo ""
echo "=== Syncing live dashboard cache ==="
HF_SPACE_URL="${HF_SPACE_URL:-https://your-space.hf.space}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${HF_SPACE_URL}/api/experiments/sync")

if [ "$HTTP_CODE" = "200" ]; then
  echo "Dashboard synced successfully."
else
  echo "Warning: sync returned HTTP $HTTP_CODE (Space may be sleeping)."
fi

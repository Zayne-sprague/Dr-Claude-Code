#!/usr/bin/env bash
# Cleanup script for testing the installer from scratch.
# Removes the test workspace, HF Space, and local state so you can re-run install.sh cleanly.
#
# Usage: bash dev/cleanup-test.sh [workspace_path]
#        Default workspace: reads from ~/.dcc/config.yaml or uses ~/Blog/ddrc

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${YELLOW}[cleanup]${RESET} $*"; }
done_() { echo -e "${GREEN}[cleanup]${RESET} $*"; }
err()   { echo -e "${RED}[cleanup]${RESET} $*"; }

# Determine workspace
WORKSPACE="${1:-}"
if [ -z "$WORKSPACE" ] && [ -f ~/.dcc/config.yaml ]; then
    WORKSPACE=$(grep '^workspace:' ~/.dcc/config.yaml 2>/dev/null | sed 's/workspace: *//' | tr -d '"')
fi
WORKSPACE="${WORKSPACE:-$HOME/Blog/ddrc}"

echo -e "${BOLD}${RED}=== Dr-Claude-Code Test Cleanup ===${RESET}"
echo ""
echo "This will remove:"
echo "  - Workspace:     ${WORKSPACE}"
echo "  - HF Space:      (if configured)"
echo "  - ~/.dcc/        (config + install state)"
echo "  - dcc CLI        (from tools venv)"
echo ""
read -rp "Are you sure? (type 'yes'): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# --- Delete HF Space ---
HF_ORG=""
if [ -f ~/.dcc/config.yaml ]; then
    HF_ORG=$(grep '^hf_org:' ~/.dcc/config.yaml 2>/dev/null | sed 's/hf_org: *//' | tr -d '"')
fi

if [ -n "$HF_ORG" ]; then
    SPACE_ID="${HF_ORG}/dr-claude-dashboard"
    info "Deleting HF Space: ${SPACE_ID} ..."
    python3 -c "
from huggingface_hub import HfApi
try:
    api = HfApi()
    api.delete_repo('${SPACE_ID}', repo_type='space')
    print('  Deleted.')
except Exception as e:
    print(f'  Skip: {e}')
" 2>/dev/null || info "Could not delete HF Space (may need manual deletion)"
fi

# --- Remove workspace ---
if [ -d "$WORKSPACE" ]; then
    info "Removing workspace: ${WORKSPACE}"
    rm -rf "$WORKSPACE"
    done_ "Workspace removed."
else
    info "Workspace not found: ${WORKSPACE} (already clean)"
fi

# --- Remove ~/.dcc ---
if [ -d ~/.dcc ]; then
    info "Removing ~/.dcc/"
    rm -rf ~/.dcc
    done_ "~/.dcc removed."
fi

# --- Remove dcc from pip if globally installed ---
if command -v dcc &>/dev/null; then
    DCC_PATH=$(command -v dcc)
    if [[ "$DCC_PATH" != *".tools-venv"* ]]; then
        info "dcc found at ${DCC_PATH} (not in a tools-venv). Uninstalling..."
        pip uninstall -y dcc 2>/dev/null || true
    fi
fi

echo ""
done_ "Clean. Ready to re-run install.sh"

#!/usr/bin/env bash
# Cleanup script for testing the installer from scratch.
# Removes workspace contents (keeps the dir + this script + install.sh), deletes HF Space, resets state.
#
# Usage: bash cleanup-test.sh [workspace_path]
#        Default workspace: reads from ~/.dcc/config.yaml

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${YELLOW}[cleanup]${RESET} $*"; }
done_() { echo -e "${GREEN}[cleanup]${RESET} $*"; }

# Determine workspace
WORKSPACE="${1:-}"
if [ -z "$WORKSPACE" ] && [ -f ~/.dcc/config.yaml ]; then
    WORKSPACE=$(grep '^workspace:' ~/.dcc/config.yaml 2>/dev/null | sed 's/workspace: *//' | tr -d '"')
fi
if [ -z "$WORKSPACE" ]; then
    echo "No workspace found. Pass it as an argument: bash cleanup-test.sh /path/to/workspace"
    exit 1
fi

# Find this script's own path so we can preserve it
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

echo -e "${BOLD}${RED}=== Dr-Claude-Code Test Cleanup ===${RESET}"
echo ""
echo "Workspace: ${WORKSPACE}"
echo ""
echo "Will remove:"
echo "  - Everything in workspace EXCEPT install.sh and this cleanup script"
echo "  - HF Space (if configured)"
echo "  - ~/.dcc/"
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

# --- Clean workspace contents (keep dir, install.sh, cleanup script) ---
if [ -d "$WORKSPACE" ]; then
    info "Cleaning workspace contents..."

    # Copy install.sh and cleanup script to temp
    TMPHOLD=$(mktemp -d)
    [ -f "${WORKSPACE}/install.sh" ] && cp "${WORKSPACE}/install.sh" "${TMPHOLD}/install.sh"
    if [ -f "$SCRIPT_PATH" ]; then
        mkdir -p "${TMPHOLD}/dev"
        cp "$SCRIPT_PATH" "${TMPHOLD}/dev/cleanup-test.sh"
    fi

    # Remove everything
    rm -rf "${WORKSPACE:?}"/*
    rm -rf "${WORKSPACE}"/.[!.]* 2>/dev/null || true  # hidden files (.claude, .tools-venv, etc.)

    # Restore kept files
    [ -f "${TMPHOLD}/install.sh" ] && cp "${TMPHOLD}/install.sh" "${WORKSPACE}/install.sh" && chmod +x "${WORKSPACE}/install.sh"
    if [ -f "${TMPHOLD}/dev/cleanup-test.sh" ]; then
        mkdir -p "${WORKSPACE}/dev"
        cp "${TMPHOLD}/dev/cleanup-test.sh" "${WORKSPACE}/dev/cleanup-test.sh"
        chmod +x "${WORKSPACE}/dev/cleanup-test.sh"
    fi
    rm -rf "$TMPHOLD"

    done_ "Workspace cleaned (kept install.sh + dev/cleanup-test.sh)"
else
    info "Workspace not found: ${WORKSPACE}"
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
        info "Uninstalling global dcc..."
        pip uninstall -y dcc 2>/dev/null || true
    fi
fi

echo ""
done_ "Clean. Ready to re-run: ./install.sh"

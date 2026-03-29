#!/usr/bin/env bash
# Cleanup script for testing the installer + onboarding from scratch.
# Removes workspace contents (keeps install.sh + this script), deletes HF Space + test datasets, resets all state.
#
# Usage: bash dev/cleanup-test.sh [workspace_path]
#        Default: reads from ~/.dcc/config.yaml or uses current dir

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
    WORKSPACE=$(grep '^workspace:' ~/.dcc/config.yaml 2>/dev/null | sed 's/workspace: *//' | tr -d '"' | tr -d ' ')
fi
WORKSPACE="${WORKSPACE:-$(pwd)}"

# Read HF info before we nuke config
HF_ORG=""
HF_USER=""
if [ -f ~/.dcc/config.yaml ]; then
    HF_ORG=$(grep '^hf_org:' ~/.dcc/config.yaml 2>/dev/null | sed 's/hf_org: *//' | tr -d '"' | tr -d ' ')
    HF_USER=$(grep '^hf_user:' ~/.dcc/config.yaml 2>/dev/null | sed 's/hf_user: *//' | tr -d '"' | tr -d ' ')
fi
# Also try reading from onboarding state
if [ -z "$HF_ORG" ] && [ -f "${WORKSPACE}/.claude/onboarding_state.json" ]; then
    HF_ORG=$(python3 -c "import json; d=json.load(open('${WORKSPACE}/.claude/onboarding_state.json')); print(d.get('hf_org',''))" 2>/dev/null || echo "")
fi

echo -e "${BOLD}${RED}=== Dr-Claude-Code Test Cleanup ===${RESET}"
echo ""
echo "Workspace: ${WORKSPACE}"
[ -n "$HF_ORG" ] && echo "HF Org:    ${HF_ORG}"
echo ""
echo "Will remove:"
echo "  - Everything in workspace EXCEPT install.sh and this cleanup script"
echo "  - HF Space: ${HF_ORG:-?}/dr-claude-dashboard (if exists)"
echo "  - HF test dataset: ${HF_ORG:-?}/drcc-onboarding-test (if exists)"
echo "  - ~/.dcc/ (config + install state)"
echo "  - ~/.ssh/sockets/ (ControlMaster sockets)"
echo "  - HF login cache"
echo ""
read -rp "Are you sure? (type 'yes'): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# --- Delete HF resources ---
if [ -n "$HF_ORG" ]; then
    info "Cleaning HuggingFace resources for org: ${HF_ORG}..."

    python3 - <<PYEOF 2>/dev/null || info "HF cleanup had issues (may need manual deletion)"
from huggingface_hub import HfApi
api = HfApi()

# Delete Space
try:
    api.delete_repo("${HF_ORG}/dr-claude-dashboard", repo_type="space")
    print("  Deleted Space: ${HF_ORG}/dr-claude-dashboard")
except Exception as e:
    print(f"  Space skip: {e}")

# Delete test dataset
try:
    api.delete_repo("${HF_ORG}/drcc-onboarding-test", repo_type="dataset")
    print("  Deleted dataset: ${HF_ORG}/drcc-onboarding-test")
except Exception as e:
    print(f"  Dataset skip: {e}")
PYEOF
fi

# --- Kill any running dcc SSH sessions ---
info "Killing SSH ControlMaster sockets..."
if [ -d ~/.ssh/sockets ]; then
    for sock in ~/.ssh/sockets/*; do
        [ -S "$sock" ] && ssh -O exit -S "$sock" dummy 2>/dev/null || true
    done
    rm -f ~/.ssh/sockets/* 2>/dev/null || true
    done_ "SSH sockets cleaned"
else
    info "No SSH sockets found"
fi

# --- Clean workspace contents (keep install.sh + cleanup script) ---
if [ -d "$WORKSPACE" ]; then
    info "Cleaning workspace contents..."

    TMPHOLD=$(mktemp -d)
    [ -f "${WORKSPACE}/install.sh" ] && cp "${WORKSPACE}/install.sh" "${TMPHOLD}/install.sh"
    SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
    if [ -f "$SCRIPT_PATH" ]; then
        mkdir -p "${TMPHOLD}/dev"
        cp "$SCRIPT_PATH" "${TMPHOLD}/dev/cleanup-test.sh"
    fi

    # Nuke everything
    rm -rf "${WORKSPACE:?}"/*
    rm -rf "${WORKSPACE}"/.[!.]* 2>/dev/null || true

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
    done_ "~/.dcc removed"
fi

# --- Remove HF login cache ---
HF_CACHE="${HOME}/.cache/huggingface/token"
if [ -f "$HF_CACHE" ]; then
    info "Removing cached HF token"
    rm -f "$HF_CACHE"
    done_ "HF token cache removed"
fi

# --- Remove dcc from global pip if present ---
if command -v dcc &>/dev/null; then
    DCC_PATH=$(command -v dcc)
    if [[ "$DCC_PATH" != *".tools-venv"* ]]; then
        info "Uninstalling global dcc..."
        pip uninstall -y dcc 2>/dev/null || python3 -m pip uninstall -y dcc 2>/dev/null || true
    fi
fi

echo ""
done_ "Clean slate. Run: ./install.sh"

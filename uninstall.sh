#!/usr/bin/env bash
# RACA uninstaller — removes only RACA-added files, leaves everything else untouched.
# Usage: bash raca-uninstall.sh [workspace_path]
set -uo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[raca]${RESET} $*"; }
success() { echo -e "${GREEN}[raca]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[raca]${RESET} $*"; }
error()   { echo -e "${RED}[raca] ERROR:${RESET} $*" >&2; }

WORKSPACE="${1:-$(pwd)}"
WORKSPACE="${WORKSPACE/#\~/$HOME}"

if [ ! -d "${WORKSPACE}/.raca" ] && [ ! -d "${WORKSPACE}/.claude/commands/raca" ] && [ ! -d "${WORKSPACE}/tools/cli/raca" ]; then
    error "No RACA installation found at ${WORKSPACE}"
    exit 1
fi

echo ""
info "Uninstalling RACA from ${BOLD}${WORKSPACE}${RESET}"
echo ""

# Helper: remove file/dir if it exists, log it
_rm() {
    local path="$1"
    local label="${path#$WORKSPACE/}"
    if [ -e "$path" ]; then
        rm -rf "$path"
        info "Removed $label"
    fi
}

# ── .claude/ — RACA-installed files ──────────────────────

# Commands (namespaced under raca/)
_rm "${WORKSPACE}/.claude/commands/raca"

# Skills — RACA installs these at top level
for skill in dashboard-visualizer experiment-management run-job setup-cluster setup-runpod; do
    _rm "${WORKSPACE}/.claude/skills/${skill}"
done

# Rules that RACA ships
for f in experiments.md huggingface.md workspace.md; do
    _rm "${WORKSPACE}/.claude/rules/${f}"
done

# Agents
for f in data-validator.md red-team-reviewer.md; do
    _rm "${WORKSPACE}/.claude/agents/${f}"
done

# References
for f in experiments.md huggingface.md tool-decision-guide.md workspace.md; do
    _rm "${WORKSPACE}/.claude/references/${f}"
done
_rm "${WORKSPACE}/.claude/references/compute"
_rm "${WORKSPACE}/.claude/references/datasets_and_tasks"

# Hooks
_rm "${WORKSPACE}/.claude/hooks"

# Config files RACA creates
_rm "${WORKSPACE}/.claude/codemap.md"
_rm "${WORKSPACE}/.claude/settings.local.json"

# CLAUDE.md — remove the RACA section if it was appended
if [ -f "${WORKSPACE}/.claude/CLAUDE.md" ]; then
    if grep -q "# RACA" "${WORKSPACE}/.claude/CLAUDE.md" 2>/dev/null; then
        # Remove everything from "# RACA" line to end of file
        sed -i.bak '/^# RACA/,$d' "${WORKSPACE}/.claude/CLAUDE.md"
        rm -f "${WORKSPACE}/.claude/CLAUDE.md.bak"
        # If the file is now empty or just whitespace, remove it
        if [ ! -s "${WORKSPACE}/.claude/CLAUDE.md" ] || ! grep -q '[^[:space:]]' "${WORKSPACE}/.claude/CLAUDE.md" 2>/dev/null; then
            rm "${WORKSPACE}/.claude/CLAUDE.md"
            info "Removed .claude/CLAUDE.md (was entirely RACA content)"
        else
            info "Cleaned RACA section from .claude/CLAUDE.md"
        fi
    fi
fi

# Clean up empty .claude/ subdirs
for d in rules agents references commands skills hooks; do
    rmdir "${WORKSPACE}/.claude/${d}" 2>/dev/null || true
done
# Remove .claude/ itself only if empty
rmdir "${WORKSPACE}/.claude" 2>/dev/null || true

# ── .raca/ — workspace state ─────────────────────────────
_rm "${WORKSPACE}/.raca"

# ── .tools-venv/ ─────────────────────────────────────────
_rm "${WORKSPACE}/.tools-venv"

# ── Shell profile — remove RACA entries ──────────────────
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$rc" ] && grep -q "# RACA tools" "$rc" 2>/dev/null; then
        sed -i.bak '/# RACA tools/,+2d' "$rc" && rm -f "${rc}.bak"
        info "Removed RACA entries from $(basename "$rc")"
    fi
done

# ── RACA-owned directories ───────────────────────────────
_rm "${WORKSPACE}/tools/cli"
_rm "${WORKSPACE}/tools/visualizer"
_rm "${WORKSPACE}/tools/chat-ui"
_rm "${WORKSPACE}/tools/setup-agent-deck.sh"
_rm "${WORKSPACE}/tools/README.md"
_rm "${WORKSPACE}/packages/key_handler"
_rm "${WORKSPACE}/packages/hf_utility"
_rm "${WORKSPACE}/packages/README.md"
_rm "${WORKSPACE}/docs"
_rm "${WORKSPACE}/notes/experiments/onboarding"
_rm "${WORKSPACE}/notes/README.md"
_rm "${WORKSPACE}/private_projects/README.md"
_rm "${WORKSPACE}/private_projects/.gitkeep"
_rm "${WORKSPACE}/public_projects/README.md"
_rm "${WORKSPACE}/public_projects/.gitkeep"

# Clean up empty parent dirs (only if empty — user content preserved)
for d in tools packages notes/experiments notes private_projects public_projects; do
    rmdir "${WORKSPACE}/${d}" 2>/dev/null || true
done

# ── Remove convenience scripts (this script removes itself last) ──
_rm "${WORKSPACE}/raca-install.sh"

echo ""
success "RACA uninstalled."
[ -d "${WORKSPACE}/.claude" ] && info "Your .claude/ folder was preserved (non-RACA files remain)."
echo ""

# Self-delete last
rm -f "${WORKSPACE}/raca-uninstall.sh" 2>/dev/null || true

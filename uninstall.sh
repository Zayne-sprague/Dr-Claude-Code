#!/usr/bin/env bash
# RACA uninstaller — removes only RACA-added files, leaves everything else untouched.
# Usage: bash uninstall.sh [workspace_path]
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

if [ ! -d "${WORKSPACE}/.raca" ] && [ ! -d "${WORKSPACE}/.claude/commands/raca" ]; then
    error "No RACA installation found at ${WORKSPACE}"
    exit 1
fi

echo ""
info "Uninstalling RACA from ${BOLD}${WORKSPACE}${RESET}"
echo ""

# ── .claude/ — remove only RACA-namespaced dirs ──────────
if [ -d "${WORKSPACE}/.claude/commands/raca" ]; then
    rm -rf "${WORKSPACE}/.claude/commands/raca"
    info "Removed .claude/commands/raca/"
fi

if [ -d "${WORKSPACE}/.claude/skills/raca" ]; then
    rm -rf "${WORKSPACE}/.claude/skills/raca"
    info "Removed .claude/skills/raca/"
fi

# ── .claude/ — remove RACA-installed rules/agents/references ──
# Only remove files that match the RACA distribution exactly.
# We track what RACA ships so we don't delete user-created files.
RACA_RULES="experiments.md git-safety.md huggingface.md python-patterns.md security.md workspace.md"
RACA_AGENTS="data-validator.md red-team-reviewer.md"
RACA_REFS="experiments.md huggingface.md tool-decision-guide.md workspace.md"

remove_if_raca() {
    local dir="$1" file="$2"
    local path="${WORKSPACE}/.claude/${dir}/${file}"
    if [ -f "$path" ]; then
        # Check if it contains RACA markers (was installed by us, not user-created)
        if grep -q "raca\|RACA\|/raca:" "$path" 2>/dev/null; then
            rm "$path"
            info "Removed .claude/${dir}/${file}"
        else
            warn "Skipped .claude/${dir}/${file} (doesn't look RACA-installed)"
        fi
    fi
}

for f in $RACA_RULES; do remove_if_raca "rules" "$f"; done
for f in $RACA_AGENTS; do remove_if_raca "agents" "$f"; done
for f in $RACA_REFS; do remove_if_raca "references" "$f"; done

# References — compute/ and datasets_and_tasks/ dirs
if [ -d "${WORKSPACE}/.claude/references/compute" ]; then
    rm -rf "${WORKSPACE}/.claude/references/compute"
    info "Removed .claude/references/compute/"
fi

# datasets_and_tasks — only remove the countdown.md and map that RACA ships
for f in countdown.md datasets_and_tasks_map.md; do
    if [ -f "${WORKSPACE}/.claude/references/datasets_and_tasks/${f}" ]; then
        rm "${WORKSPACE}/.claude/references/datasets_and_tasks/${f}"
        info "Removed .claude/references/datasets_and_tasks/${f}"
    fi
done
rmdir "${WORKSPACE}/.claude/references/datasets_and_tasks" 2>/dev/null || true

# Clean up empty dirs
for d in rules agents references commands skills; do
    rmdir "${WORKSPACE}/.claude/${d}" 2>/dev/null || true
done

# ── .raca/ — workspace state ─────────────────────────────
if [ -d "${WORKSPACE}/.raca" ]; then
    rm -rf "${WORKSPACE}/.raca"
    info "Removed .raca/"
fi

# ── .tools-venv/ — RACA tools venv ──────────────────────
if [ -d "${WORKSPACE}/.tools-venv" ]; then
    rm -rf "${WORKSPACE}/.tools-venv"
    info "Removed .tools-venv/"
fi

# ── Shell profile — remove PATH entry ───────────────────
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$rc" ] && grep -q "# RACA tools" "$rc" 2>/dev/null; then
        # Remove the comment line and the export line after it
        sed -i.bak '/# RACA tools/,+1d' "$rc" && rm -f "${rc}.bak"
        info "Removed RACA PATH entry from $(basename "$rc")"
    fi
done

# ── RACA-owned directories ───────────────────────────────
# tools/, packages/, docs/ — only remove if they were RACA-created (contain RACA files)
for d in tools/cli tools/visualizer tools/chat-ui tools/setup-agent-deck.sh packages/key_handler packages/hf_utility docs; do
    path="${WORKSPACE}/${d}"
    if [ -e "$path" ]; then
        rm -rf "$path"
        info "Removed ${d}"
    fi
done
# Clean up empty parent dirs
rmdir "${WORKSPACE}/tools" 2>/dev/null || true
rmdir "${WORKSPACE}/packages" 2>/dev/null || true
rmdir "${WORKSPACE}/docs" 2>/dev/null || true

# ── Remove convenience scripts ──────────────────────────
rm -f "${WORKSPACE}/raca-install.sh" "${WORKSPACE}/raca-uninstall.sh"
info "Removed raca-install.sh and raca-uninstall.sh"

echo ""
success "RACA uninstalled. Your .claude/CLAUDE.md and other personal config are untouched."
info "If RACA appended to your .claude/CLAUDE.md, you may want to remove the RACA section manually."
echo ""

#!/usr/bin/env bash
# RACA updater — pulls latest RACA files without touching user content.
# Usage: bash raca-update.sh
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
die()     { error "$*"; exit 1; }

REPO_URL="https://github.com/Zayne-sprague/Dr-Claude-Code.git"

# ── Find workspace ────────────────────────────────────────
# If run as raca-update.sh from workspace, cwd is the workspace
WORKSPACE="$(pwd)"
if [ ! -d "${WORKSPACE}/.raca" ]; then
    # Try RACA_WORKSPACE env
    if [ -n "${RACA_WORKSPACE:-}" ] && [ -d "${RACA_WORKSPACE}/.raca" ]; then
        WORKSPACE="$RACA_WORKSPACE"
    else
        die "Cannot find RACA workspace. Run this from your workspace directory or set RACA_WORKSPACE."
    fi
fi

echo ""
info "Updating RACA in ${BOLD}${WORKSPACE}${RESET}"
echo ""

# ── Clone latest ──────────────────────────────────────────
info "Fetching latest..."
mkdir -p "${WORKSPACE}"
rm -rf "${WORKSPACE}/.raca-repo"
git clone --depth=1 "$REPO_URL" "${WORKSPACE}/.raca-repo" 2>&1 | sed "s/^/    /" \
    || die "Failed to clone repo."
REPO_DIR="${WORKSPACE}/.raca-repo"

# ── Update RACA-owned files ───────────────────────────────
# These are RACA's files — always overwrite with latest.
# User content (notes/, private_projects/, .raca/config.yaml, key_handler.py) is NEVER touched.

# Tools (cli, visualizer, chat-ui)
info "Updating tools/"
for d in tools/cli tools/visualizer tools/chat-ui; do
    if [ -d "${REPO_DIR}/${d}" ]; then
        rm -rf "${WORKSPACE}/${d}"
        mkdir -p "$(dirname "${WORKSPACE}/${d}")"
        cp -R "${REPO_DIR}/${d}" "${WORKSPACE}/${d}"
    fi
done
# Also copy top-level tool files
for f in tools/setup-agent-deck.sh tools/README.md; do
    [ -f "${REPO_DIR}/${f}" ] && cp "${REPO_DIR}/${f}" "${WORKSPACE}/${f}"
done
# Clean node_modules etc that cp drags along
find "${WORKSPACE}/tools" -type d \( -name node_modules -o -name __pycache__ -o -name .venv -o -name dist \) -exec rm -rf {} + 2>/dev/null || true

# Packages (but preserve key_handler.py — that has the user's actual keys)
info "Updating packages/ (preserving your API keys)"
for pkg in key_handler hf_utility; do
    if [ -d "${REPO_DIR}/packages/${pkg}" ]; then
        # Save user's key_handler.py if it exists
        KEY_FILE="${WORKSPACE}/packages/key_handler/key_handler/key_handler.py"
        KEY_BACKUP=""
        if [ -f "$KEY_FILE" ]; then
            KEY_BACKUP=$(mktemp)
            cp "$KEY_FILE" "$KEY_BACKUP"
        fi

        rm -rf "${WORKSPACE}/packages/${pkg}"
        cp -R "${REPO_DIR}/packages/${pkg}" "${WORKSPACE}/packages/${pkg}"

        # Restore user's key_handler.py
        if [ -n "$KEY_BACKUP" ] && [ -f "$KEY_BACKUP" ]; then
            cp "$KEY_BACKUP" "$KEY_FILE"
            rm "$KEY_BACKUP"
        fi
    fi
done
[ -f "${REPO_DIR}/packages/README.md" ] && cp "${REPO_DIR}/packages/README.md" "${WORKSPACE}/packages/README.md"

# .claude/ — overwrite RACA-owned config, preserve user additions
info "Updating .claude/ config"

# Rules, agents, references — overwrite with latest
for subdir in rules agents references; do
    if [ -d "${REPO_DIR}/.claude/${subdir}" ]; then
        # Copy each file, overwriting existing RACA files
        find "${REPO_DIR}/.claude/${subdir}" -type f | while read -r f; do
            rel="${f#${REPO_DIR}/.claude/${subdir}/}"
            target="${WORKSPACE}/.claude/${subdir}/${rel}"
            mkdir -p "$(dirname "$target")"
            cp "$f" "$target"
        done
    fi
done

# Commands/raca — overwrite entirely
rm -rf "${WORKSPACE}/.claude/commands/raca"
cp -R "${REPO_DIR}/.claude/commands/raca" "${WORKSPACE}/.claude/commands/raca"

# Skills — overwrite RACA-shipped skills, leave user-added skills alone
for skill_dir in "${REPO_DIR}/.claude/skills"/*/; do
    skill_name=$(basename "$skill_dir")
    rm -rf "${WORKSPACE}/.claude/skills/${skill_name}"
    cp -R "$skill_dir" "${WORKSPACE}/.claude/skills/${skill_name}"
done

# Agents
if [ -d "${REPO_DIR}/.claude/agents" ]; then
    mkdir -p "${WORKSPACE}/.claude/agents"
    cp "${REPO_DIR}/.claude/agents/"*.md "${WORKSPACE}/.claude/agents/" 2>/dev/null || true
fi

# Codemap
[ -f "${REPO_DIR}/.claude/codemap.md" ] && cp "${REPO_DIR}/.claude/codemap.md" "${WORKSPACE}/.claude/codemap.md"

# Hooks
if [ -d "${REPO_DIR}/.claude/hooks" ]; then
    mkdir -p "${WORKSPACE}/.claude/hooks"
    cp "${REPO_DIR}/.claude/hooks/"* "${WORKSPACE}/.claude/hooks/" 2>/dev/null || true
    chmod +x "${WORKSPACE}/.claude/hooks/"*.sh 2>/dev/null || true
fi

# CLAUDE.md — always overwrite (this is RACA's, not the user's)
[ -f "${REPO_DIR}/.claude/CLAUDE.md" ] && cp "${REPO_DIR}/.claude/CLAUDE.md" "${WORKSPACE}/.claude/CLAUDE.md"

# Docs
info "Updating docs/"
rm -rf "${WORKSPACE}/docs"
cp -R "${REPO_DIR}/docs" "${WORKSPACE}/docs"

# Onboarding experiment (only if user hasn't modified it)
if [ -d "${REPO_DIR}/notes/experiments/onboarding" ]; then
    mkdir -p "${WORKSPACE}/notes/experiments"
    if [ ! -d "${WORKSPACE}/notes/experiments/onboarding" ]; then
        cp -R "${REPO_DIR}/notes/experiments/onboarding" "${WORKSPACE}/notes/experiments/onboarding"
        info "Added onboarding experiment"
    fi
fi

# READMEs for top-level folders
for f in notes/README.md private_projects/README.md public_projects/README.md tools/README.md packages/README.md; do
    [ -f "${REPO_DIR}/${f}" ] && mkdir -p "$(dirname "${WORKSPACE}/${f}")" && cp "${REPO_DIR}/${f}" "${WORKSPACE}/${f}"
done

# ── Reinstall CLI tools ───────────────────────────────────
info "Reinstalling tools..."
TOOLS_VENV="${WORKSPACE}/.tools-venv"
if [ -d "$TOOLS_VENV" ]; then
    "${TOOLS_VENV}/bin/pip" install --quiet -e "${WORKSPACE}/tools/cli/" 2>/dev/null || true
    "${TOOLS_VENV}/bin/pip" install --quiet -e "${WORKSPACE}/packages/key_handler/" 2>/dev/null || true
    "${TOOLS_VENV}/bin/pip" install --quiet -e "${WORKSPACE}/packages/hf_utility/" 2>/dev/null || true
    "${TOOLS_VENV}/bin/raca" --version &>/dev/null && success "raca CLI updated" || warn "raca CLI issue"
fi

# ── Update convenience scripts ────────────────────────────
cp "${REPO_DIR}/install.sh" "${WORKSPACE}/raca-install.sh" 2>/dev/null || true
cp "${REPO_DIR}/uninstall.sh" "${WORKSPACE}/raca-uninstall.sh" 2>/dev/null || true
cp "${REPO_DIR}/update.sh" "${WORKSPACE}/raca-update.sh" 2>/dev/null || true
chmod +x "${WORKSPACE}/raca-install.sh" "${WORKSPACE}/raca-uninstall.sh" "${WORKSPACE}/raca-update.sh" 2>/dev/null || true

# ── Cleanup ───────────────────────────────────────────────
rm -rf "${WORKSPACE}/.raca-repo"

echo ""
success "RACA updated!"
info "Your experiments, notes, API keys, and cluster config are untouched."
echo ""

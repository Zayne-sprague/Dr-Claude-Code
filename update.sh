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

# .claude/ — overwrite RACA-owned config, preserve user modifications
info "Updating .claude/ config"

# ── Hash-based conflict detection ─────────────────────────
# Load stored hashes from last install/update
HASH_FILE="${WORKSPACE}/.raca/file_hashes.json"
CONFLICT_FILE=$(mktemp)
trap 'rm -f "$CONFLICT_FILE"' EXIT

# hash_matches <relative_path> — returns 0 if file is unmodified (or new), 1 if user-modified
hash_matches() {
    local rel_path="$1"
    local abs_path="${WORKSPACE}/${rel_path}"
    # New file (didn't exist before) — safe to write
    [ ! -f "$abs_path" ] && return 0
    # No hash file — first update after old install, treat as safe
    [ ! -f "$HASH_FILE" ] && return 0
    # Look up stored hash (simple grep from JSON)
    local stored_hash
    stored_hash=$(grep "\"${rel_path}\"" "$HASH_FILE" 2>/dev/null | sed 's/.*: *"//;s/".*//' || echo "")
    # No stored hash for this file — new RACA file, safe to write
    [ -z "$stored_hash" ] && return 0
    # Compare current file hash to stored hash
    local current_hash
    current_hash=$(shasum -a 256 "$abs_path" | cut -d' ' -f1)
    [ "$current_hash" = "$stored_hash" ] && return 0
    # Hash mismatch — user modified this file
    return 1
}

# safe_copy <source> <relative_dest> — copy if unmodified, skip if user-modified
safe_copy() {
    local src="$1"
    local rel="$2"
    local dst="${WORKSPACE}/${rel}"
    mkdir -p "$(dirname "$dst")"
    if hash_matches "$rel"; then
        cp "$src" "$dst"
    else
        echo "$rel" >> "$CONFLICT_FILE"
    fi
}

# Rules, agents, references — check each file before overwriting
for subdir in rules agents references; do
    if [ -d "${REPO_DIR}/.claude/${subdir}" ]; then
        find "${REPO_DIR}/.claude/${subdir}" -type f | while read -r f; do
            rel="${f#${REPO_DIR}/}"
            safe_copy "$f" "$rel"
        done
    fi
done

# Commands/raca — check each file instead of blowing away the directory
if [ -d "${REPO_DIR}/.claude/commands/raca" ]; then
    find "${REPO_DIR}/.claude/commands/raca" -type f | while read -r f; do
        rel="${f#${REPO_DIR}/}"
        safe_copy "$f" "$rel"
    done
    # Remove files that no longer exist in repo (cleanup stale commands)
    if [ -d "${WORKSPACE}/.claude/commands/raca" ]; then
        find "${WORKSPACE}/.claude/commands/raca" -type f | while read -r f; do
            rel="${f#${WORKSPACE}/}"
            repo_file="${REPO_DIR}/${rel}"
            if [ ! -f "$repo_file" ] && hash_matches "$rel"; then
                rm "$f"
            fi
        done
    fi
fi

# Skills — check each file, leave user-added skills alone
for skill_dir in "${REPO_DIR}/.claude/skills"/*/; do
    [ -d "$skill_dir" ] || continue
    find "$skill_dir" -type f | while read -r f; do
        rel="${f#${REPO_DIR}/}"
        safe_copy "$f" "$rel"
    done
done

# Hooks
if [ -d "${REPO_DIR}/.claude/hooks" ]; then
    mkdir -p "${WORKSPACE}/.claude/hooks"
    for f in "${REPO_DIR}/.claude/hooks/"*; do
        [ -f "$f" ] || continue
        rel=".claude/hooks/$(basename "$f")"
        safe_copy "$f" "$rel"
    done
    chmod +x "${WORKSPACE}/.claude/hooks/"*.sh 2>/dev/null || true
fi

# Codemap
[ -f "${REPO_DIR}/.claude/codemap.md" ] && safe_copy "${REPO_DIR}/.claude/codemap.md" ".claude/codemap.md"

# CLAUDE.md
[ -f "${REPO_DIR}/.claude/CLAUDE.md" ] && safe_copy "${REPO_DIR}/.claude/CLAUDE.md" ".claude/CLAUDE.md"

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

# ── Regenerate file hashes ────────────────────────────────
# For files we overwrote: hash the new content.
# For files the user modified (conflicts): keep the OLD stored hash so future
# updates continue to detect the user's modification.
info "Recording file hashes..."
NEW_HASH_FILE="${WORKSPACE}/.raca/file_hashes.json"
echo "{" > "$NEW_HASH_FILE"
FIRST=true
while IFS= read -r f; do
    rel="${f#${WORKSPACE}/}"
    # Check if this file was a conflict (user-modified, skipped)
    if [ -s "$CONFLICT_FILE" ] && grep -qxF "$rel" "$CONFLICT_FILE" 2>/dev/null; then
        # Keep the old stored hash so next update still detects the modification
        hash=$(grep "\"${rel}\"" "$HASH_FILE" 2>/dev/null | sed 's/.*: *"//;s/".*//' || echo "")
        # If no old hash found (shouldn't happen), hash the current file
        [ -z "$hash" ] && hash=$(shasum -a 256 "$f" | cut -d' ' -f1)
    else
        hash=$(shasum -a 256 "$f" | cut -d' ' -f1)
    fi
    if [ "$FIRST" = true ]; then
        FIRST=false
    else
        echo "," >> "$NEW_HASH_FILE"
    fi
    printf '  "%s": "%s"' "$rel" "$hash" >> "$NEW_HASH_FILE"
done < <(find "${WORKSPACE}/.claude/rules" "${WORKSPACE}/.claude/agents" \
    "${WORKSPACE}/.claude/references" "${WORKSPACE}/.claude/commands/raca" \
    "${WORKSPACE}/.claude/skills" "${WORKSPACE}/.claude/hooks" \
    -type f 2>/dev/null; \
    for single in "${WORKSPACE}/.claude/codemap.md" "${WORKSPACE}/.claude/CLAUDE.md"; do \
        [ -f "$single" ] && echo "$single"; \
    done)
echo "" >> "$NEW_HASH_FILE"
echo "}" >> "$NEW_HASH_FILE"

# ── Cleanup ───────────────────────────────────────────────
rm -rf "${WORKSPACE}/.raca-repo"

echo ""
success "RACA updated!"
info "Your experiments, notes, API keys, and cluster config are untouched."

# ── Report conflicts ─────────────────────────────────────
if [ -s "$CONFLICT_FILE" ]; then
    echo ""
    warn "${BOLD}These files were modified by you and skipped:${RESET}"
    while IFS= read -r c; do
        echo -e "  ${YELLOW}•${RESET} ${c}"
    done < "$CONFLICT_FILE"
    echo ""
    info "Run ${BOLD}/raca:update${RESET} to have Claude help merge them."
fi
echo ""

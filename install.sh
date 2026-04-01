#!/usr/bin/env bash
# RACA installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/install.sh | bash
# Or:    bash install.sh
#
# Cache busting: if running via curl|bash and hitting stale CDN cache,
# use: curl -fsSL "https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/install.sh?$(date +%s)" | bash
set -euo pipefail
RACA_INSTALLER_VERSION="2026.04.01"

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
# Config lives inside the workspace at .raca/ (not ~/.raca)
# RACA_CONFIG_DIR is set after WORKSPACE is known

# Cleanup temp dir on exit
TMPDIR_RACA=""
cleanup() { [ -n "$TMPDIR_RACA" ] && [ -d "$TMPDIR_RACA" ] && rm -rf "$TMPDIR_RACA"; }
trap cleanup EXIT

# ── Preflight ──────────────────────────────────────────────
echo ""
info "RACA installer v${RACA_INSTALLER_VERSION}"
info "Checking prerequisites..."

PREFLIGHT_OK=true
check_cmd() {
    if ! command -v "$1" &>/dev/null; then
        error "'$1' not found. Install: $2"
        PREFLIGHT_OK=false
    fi
}

check_cmd git "https://git-scm.com/downloads"
check_cmd python3 "https://www.python.org/downloads/"
check_cmd node "https://nodejs.org/"
check_cmd claude "https://docs.anthropic.com/en/docs/claude-code/setup"

# Python version check
if command -v python3 &>/dev/null; then
    PY_MINOR=$(python3 -c 'import sys; print(sys.version_info.minor)')
    PY_MAJOR=$(python3 -c 'import sys; print(sys.version_info.major)')
    [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; } && {
        error "Python 3.10+ required. Found: $(python3 --version)"
        PREFLIGHT_OK=false
    }
fi

[ "$PREFLIGHT_OK" = "true" ] || die "Fix the issues above and re-run."
success "All prerequisites met."

# ── Workspace ──────────────────────────────────────────────
# When running via curl|bash, stdin is the pipe — read from /dev/tty instead
echo ""
read -rp "$(echo -e "${BLUE}>${RESET} Workspace location [$(pwd)]: ")" WORKSPACE < /dev/tty
WORKSPACE="${WORKSPACE:-$(pwd)}"
WORKSPACE="${WORKSPACE/#\~/$HOME}"
RACA_CONFIG_DIR="${WORKSPACE}/.raca"

# ── Clone & Copy ──────────────────────────────────────────
echo ""
info "Setting up workspace..."

# Detect if we're inside the repo already (user did git clone + bash install.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/.claude/CLAUDE.md" ]; then
    REPO_DIR="$SCRIPT_DIR"
    info "  Using local repo at ${REPO_DIR}"
else
    TMPDIR_RACA=$(mktemp -d)
    info "  Cloning RACA (fresh, no cache)..."
    git clone --depth=1 --no-single-branch "$REPO_URL" "${TMPDIR_RACA}/RACA" 2>&1 | sed "s/^/    /" \
        || git clone --depth=1 "$REPO_URL" "${TMPDIR_RACA}/RACA" 2>&1 | sed "s/^/    /" \
        || die "Failed to clone repo."
    REPO_DIR="${TMPDIR_RACA}/RACA"
fi

mkdir -p "${WORKSPACE}/notes/experiments" "${WORKSPACE}/packages"

# Copy tools, packages, docs
for d in tools packages docs; do
    [ -d "${REPO_DIR}/${d}" ] && {
        info "  Syncing ${d}/"
        # Use cp instead of rsync — rsync misinterprets paths with colons as remote hosts
        mkdir -p "${WORKSPACE}/${d}"
        cp -R "${REPO_DIR}/${d}/." "${WORKSPACE}/${d}/" 2>/dev/null || true
        # Clean up unwanted dirs that cp copies
        find "${WORKSPACE}/${d}" -type d \( -name node_modules -o -name __pycache__ -o -name .venv -o -name dist \) -exec rm -rf {} + 2>/dev/null || true
    }
done

if [ ! -d "${WORKSPACE}/.claude" ]; then
    info "  Installing .claude/ config"
    cp -r "${REPO_DIR}/.claude" "${WORKSPACE}/.claude"
else
    info "  .claude/ exists — merging RACA config into it"
    # Merge RACA subdirectories without overwriting existing user files
    for subdir in rules agents references commands/raca skills/raca; do
        src="${REPO_DIR}/.claude/${subdir}"
        dst="${WORKSPACE}/.claude/${subdir}"
        if [ -d "$src" ]; then
            mkdir -p "$dst"
            # Copy files, skip ones the user already has
            find "$src" -type f | while read -r f; do
                rel="${f#$src/}"
                target="${dst}/${rel}"
                mkdir -p "$(dirname "$target")"
                if [ ! -f "$target" ]; then
                    cp "$f" "$target"
                fi
            done
        fi
    done
    # CLAUDE.md — append RACA section if not already present
    if [ -f "${WORKSPACE}/.claude/CLAUDE.md" ]; then
        if ! grep -q "RACA" "${WORKSPACE}/.claude/CLAUDE.md" 2>/dev/null; then
            info "  Appending RACA instructions to existing CLAUDE.md"
            echo "" >> "${WORKSPACE}/.claude/CLAUDE.md"
            cat "${REPO_DIR}/.claude/CLAUDE.md" >> "${WORKSPACE}/.claude/CLAUDE.md"
        fi
    else
        cp "${REPO_DIR}/.claude/CLAUDE.md" "${WORKSPACE}/.claude/CLAUDE.md"
    fi
    # settings.local.json — don't overwrite, user's permissions are sacred
    success "  RACA config merged (your existing files preserved)"
fi

# ── Migrate from old Dr. Claude Code install ─────────────
# Clean up stale .drcc/ and commands/drcc/ from pre-rename installs
if [ -d "${WORKSPACE}/.drcc" ]; then
    warn "  Found old .drcc/ from previous install — migrating to .raca/"
    # Copy config if .raca/ doesn't exist yet
    if [ ! -d "${WORKSPACE}/.raca" ]; then
        cp -r "${WORKSPACE}/.drcc" "${WORKSPACE}/.raca"
    fi
    rm -rf "${WORKSPACE}/.drcc"
fi
if [ -d "${WORKSPACE}/.claude/commands/drcc" ]; then
    warn "  Found old commands/drcc/ — removing (replaced by commands/raca/)"
    rm -rf "${WORKSPACE}/.claude/commands/drcc"
fi

# .raca/ — workspace state (onboarding, etc.) — Claude has full read/write here
mkdir -p "${WORKSPACE}/.raca"
if [ ! -f "${WORKSPACE}/.raca/onboarding_state.json" ]; then
    cat > "${WORKSPACE}/.raca/onboarding_state.json" <<'STATEJSON'
{
  "step": "welcome",
  "plugins": "pending",
  "compute": "pending",
  "experiment_setup": "pending",
  "dashboard_local": "pending",
  "dashboard_hf": "pending",
  "redteam": "pending",
  "model_hosted": "pending",
  "job_ran": "pending",
  "results_reviewed": "pending",
  "user_notes": "pending",
  "completed": false,
  "cluster_name": null,
  "model_url": null,
  "dashboard_url": null,
  "hf_org": null,
  "updated_at": null
}
STATEJSON
fi

# ── Install tools ─────────────────────────────────────────
TOOLS_VENV="${WORKSPACE}/.tools-venv"
[ ! -d "$TOOLS_VENV" ] && python3 -m venv "$TOOLS_VENV"

info "Installing tools..."
"${TOOLS_VENV}/bin/pip" install --quiet --upgrade pip 2>/dev/null
"${TOOLS_VENV}/bin/pip" install --quiet huggingface_hub 2>/dev/null || true
[ -f "${WORKSPACE}/tools/cli/pyproject.toml" ] && \
    "${TOOLS_VENV}/bin/pip" install --quiet -e "${WORKSPACE}/tools/cli/"
[ -f "${WORKSPACE}/packages/key_handler/pyproject.toml" ] && \
    "${TOOLS_VENV}/bin/pip" install --quiet -e "${WORKSPACE}/packages/key_handler/"

# Verify
"${TOOLS_VENV}/bin/raca" --version &>/dev/null && success "raca CLI installed" || warn "raca install issue"

# Add raca to PATH via shell profile
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

PATH_LINE="export PATH=\"${TOOLS_VENV}/bin:\$PATH\""
if [ -n "$SHELL_RC" ]; then
    if ! grep -q ".tools-venv/bin" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# RACA tools" >> "$SHELL_RC"
        echo "$PATH_LINE" >> "$SHELL_RC"
        success "Added raca to PATH in $(basename "$SHELL_RC")"
    fi
fi
export PATH="${TOOLS_VENV}/bin:$PATH"

# ── Hooks (optional) ─────────────────────────────────────
if [ -f "${WORKSPACE}/.claude/settings.local.json" ]; then
    echo ""
    info "RACA includes two optional hooks:"
    info "  - git-push-safety: blocks force pushes and pushes to upstream"
    info "  - python-lint: auto-runs ruff on edited Python files"
    read -rp "$(echo -e "${BLUE}>${RESET} Enable hooks? (y/n) [y]: ")" ENABLE_HOOKS < /dev/tty
    ENABLE_HOOKS="${ENABLE_HOOKS:-y}"
    if [[ ! "$ENABLE_HOOKS" =~ ^[Yy] ]]; then
        "${TOOLS_VENV}/bin/python" -c "
import json
p = '${WORKSPACE}/.claude/settings.local.json'
with open(p) as f: d = json.load(f)
d.pop('hooks', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" 2>/dev/null || true
        info "  Hooks disabled"
    else
        success "  Hooks enabled"
    fi
fi

# ── HuggingFace token ─────────────────────────────────────
echo ""
info "A HuggingFace token lets Claude deploy your dashboard and upload datasets."
info "Get one at: ${BOLD}https://huggingface.co/settings/tokens${RESET} (write access)"
echo ""
read -rsp "$(echo -e "${BLUE}>${RESET} HuggingFace token (paste, hidden — or Enter to skip): ")" HF_TOKEN < /dev/tty
echo ""
HF_TOKEN=$(echo "$HF_TOKEN" | tr -d '[:space:]')

if [ -n "$HF_TOKEN" ]; then
    # Save to key_handler
    KEY_TEMPLATE="${WORKSPACE}/packages/key_handler/key_handler/key_handler__template.py"
    KEY_FILE="${WORKSPACE}/packages/key_handler/key_handler/key_handler.py"
    if [ -f "$KEY_TEMPLATE" ]; then
        cp "$KEY_TEMPLATE" "$KEY_FILE"
        sed -i.bak "s|your-hf-token|${HF_TOKEN}|g" "$KEY_FILE" && rm -f "${KEY_FILE}.bak"
        success "HF token saved to key_handler"
    fi

    # HF login
    RACA_HF_TOKEN="$HF_TOKEN" "${TOOLS_VENV}/bin/python" - <<'PYEOF' 2>/dev/null || true
import os
from huggingface_hub import login
login(token=os.environ["RACA_HF_TOKEN"], add_to_git_credential=False)
PYEOF

    # Get username for config
    HF_USER=$(RACA_HF_TOKEN="$HF_TOKEN" "${TOOLS_VENV}/bin/python" -c "
import os, sys, io, warnings
warnings.filterwarnings('ignore')
sys.stderr = io.StringIO()
from huggingface_hub import HfApi
api = HfApi(token=os.environ['RACA_HF_TOKEN'])
sys.stderr = sys.__stderr__
print(api.whoami()['name'])
" 2>/dev/null || echo "")
    [ -n "$HF_USER" ] && success "Authenticated as: ${HF_USER}"
fi

# ── Save config ───────────────────────────────────────────
mkdir -p "$RACA_CONFIG_DIR"
cat > "${RACA_CONFIG_DIR}/config.yaml" <<YAML
workspace: ${WORKSPACE}
hf_token_set: $([ -n "${HF_TOKEN}" ] && echo "true" || echo "false")
hf_user: ${HF_USER:-""}
tools_venv: ${TOOLS_VENV}
installed_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
YAML

# Add tools venv to PATH for this session
export PATH="${TOOLS_VENV}/bin:$PATH"

# ── Hand off to Claude ────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Workspace ready!${RESET}"
echo ""
info "Launching Claude Code to finish setup..."
info "Claude will deploy your dashboard, help you connect a cluster, and walk you through everything."
echo ""

cd "$WORKSPACE"
exec claude "/raca:onboarding"

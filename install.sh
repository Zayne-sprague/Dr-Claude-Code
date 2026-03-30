#!/usr/bin/env bash
# Dr-Claude-Code installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/install.sh | bash
# Or:    bash install.sh
set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[dcc]${RESET} $*"; }
success() { echo -e "${GREEN}[dcc]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[dcc]${RESET} $*"; }
error()   { echo -e "${RED}[dcc] ERROR:${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

REPO_URL="https://github.com/Zayne-sprague/Dr-Claude-Code.git"
# Config lives inside the workspace at .drcc/ (not ~/.dcc)
# DCC_CONFIG_DIR is set after WORKSPACE is known

# Cleanup temp dir on exit
TMPDIR_DCC=""
cleanup() { [ -n "$TMPDIR_DCC" ] && [ -d "$TMPDIR_DCC" ] && rm -rf "$TMPDIR_DCC"; }
trap cleanup EXIT

# ── Preflight ──────────────────────────────────────────────
echo ""
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
DCC_CONFIG_DIR="${WORKSPACE}/.drcc"

# ── Clone & Copy ──────────────────────────────────────────
echo ""
info "Setting up workspace..."

TMPDIR_DCC=$(mktemp -d)
git clone --depth=1 "$REPO_URL" "${TMPDIR_DCC}/Dr-Claude-Code" 2>&1 | sed "s/^/  /" || die "Failed to clone repo."
REPO_DIR="${TMPDIR_DCC}/Dr-Claude-Code"

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

# .claude/ — don't overwrite existing
if [ ! -d "${WORKSPACE}/.claude" ]; then
    info "  Installing .claude/ config"
    cp -r "${REPO_DIR}/.claude" "${WORKSPACE}/.claude"

    # Hooks are optional
    echo ""
    info "Dr Claude Code includes two optional git hooks:"
    info "  - git-push-safety: blocks force pushes and pushes to upstream"
    info "  - python-lint: auto-runs ruff on edited Python files"
    read -rp "$(echo -e "${BLUE}>${RESET} Enable hooks? (y/n) [y]: ")" ENABLE_HOOKS < /dev/tty
    ENABLE_HOOKS="${ENABLE_HOOKS:-y}"
    if [[ ! "$ENABLE_HOOKS" =~ ^[Yy] ]]; then
        # Remove hooks from settings.local.json
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
else
    warn "  .claude/ exists — preserving your config"
fi

# .drcc/ — workspace state (onboarding, etc.) — Claude has full read/write here
mkdir -p "${WORKSPACE}/.drcc"
if [ ! -f "${WORKSPACE}/.drcc/onboarding_state.json" ]; then
    cat > "${WORKSPACE}/.drcc/onboarding_state.json" <<'STATEJSON'
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
"${TOOLS_VENV}/bin/dcc" --version &>/dev/null && success "dcc CLI installed" || warn "dcc install issue"

# Add dcc to PATH via shell profile
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
        echo "# Dr Claude Code tools" >> "$SHELL_RC"
        echo "$PATH_LINE" >> "$SHELL_RC"
        success "Added dcc to PATH in $(basename "$SHELL_RC")"
    fi
fi
export PATH="${TOOLS_VENV}/bin:$PATH"

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
    DCC_HF_TOKEN="$HF_TOKEN" "${TOOLS_VENV}/bin/python" - <<'PYEOF' 2>/dev/null || true
import os
from huggingface_hub import login
login(token=os.environ["DCC_HF_TOKEN"], add_to_git_credential=False)
PYEOF

    # Get username for config
    HF_USER=$(DCC_HF_TOKEN="$HF_TOKEN" "${TOOLS_VENV}/bin/python" -c "
import os, sys, io, warnings
warnings.filterwarnings('ignore')
sys.stderr = io.StringIO()
from huggingface_hub import HfApi
api = HfApi(token=os.environ['DCC_HF_TOKEN'])
sys.stderr = sys.__stderr__
print(api.whoami()['name'])
" 2>/dev/null || echo "")
    [ -n "$HF_USER" ] && success "Authenticated as: ${HF_USER}"
fi

# ── Save config ───────────────────────────────────────────
mkdir -p "$DCC_CONFIG_DIR"
cat > "${DCC_CONFIG_DIR}/config.yaml" <<YAML
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
exec claude "/drcc:onboarding"

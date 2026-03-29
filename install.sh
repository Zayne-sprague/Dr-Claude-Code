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
DCC_CONFIG_DIR="${HOME}/.dcc"

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
echo ""
read -rp "$(echo -e "${BLUE}>${RESET} Workspace location [$(pwd)]: ")" WORKSPACE
WORKSPACE="${WORKSPACE:-$(pwd)}"
WORKSPACE="${WORKSPACE/#\~/$HOME}"

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
        rsync -a --exclude='node_modules' --exclude='__pycache__' --exclude='.venv' --exclude='dist' \
            "${REPO_DIR}/${d}/" "${WORKSPACE}/${d}/"
    }
done

# .claude/ — don't overwrite existing
if [ ! -d "${WORKSPACE}/.claude" ]; then
    info "  Installing .claude/ config"
    cp -r "${REPO_DIR}/.claude" "${WORKSPACE}/.claude"
else
    warn "  .claude/ exists — preserving your config"
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

# ── HuggingFace token ─────────────────────────────────────
echo ""
info "A HuggingFace token lets Claude deploy your dashboard and upload datasets."
info "Get one at: ${BOLD}https://huggingface.co/settings/tokens${RESET} (write access)"
echo ""
read -rsp "$(echo -e "${BLUE}>${RESET} HuggingFace token (paste, hidden — or Enter to skip): ")" HF_TOKEN
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

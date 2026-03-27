#!/usr/bin/env bash
# Dr-Claude-Code installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/install.sh | bash
# Or:    bash install.sh
set -euo pipefail

# ============================================================
# Colors
# ============================================================
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
header()  { echo -e "\n${BOLD}${BLUE}=== $* ===${RESET}\n"; }

# ============================================================
# Cleanup on exit
# ============================================================
TMPDIR_DCC=""
cleanup() {
    if [ -n "$TMPDIR_DCC" ] && [ -d "$TMPDIR_DCC" ]; then
        rm -rf "$TMPDIR_DCC"
    fi
}
trap cleanup EXIT

REPO_URL="https://github.com/Zayne-sprague/Dr-Claude-Code.git"
DCC_CONFIG_DIR="${HOME}/.dcc"
DCC_CONFIG_FILE="${DCC_CONFIG_DIR}/config.yaml"

# ============================================================
# State file — resume from where you left off
# ============================================================
STATE_FILE="${DCC_CONFIG_DIR}/.install-state"

load_state() {
    mkdir -p "$DCC_CONFIG_DIR"
    if [ -f "$STATE_FILE" ]; then
        # shellcheck source=/dev/null
        source "$STATE_FILE"
        info "Resuming previous install (state at: ${STATE_FILE})"
    fi
}

save_state() {
    mkdir -p "$DCC_CONFIG_DIR"
    cat > "$STATE_FILE" <<EOF
# Dr-Claude-Code install state — auto-generated, safe to delete
SAVED_WORKSPACE="${WORKSPACE:-}"
SAVED_HF_TOKEN="${HF_TOKEN:-}"
SAVED_HF_USERNAME="${HF_USERNAME:-}"
SAVED_HF_ORG="${HF_ORG:-}"
SAVED_PHASE="${CURRENT_PHASE:-prompts}"
EOF
}

# Load any saved state
SAVED_WORKSPACE=""
SAVED_HF_TOKEN=""
SAVED_HF_USERNAME=""
SAVED_HF_ORG=""
SAVED_PHASE=""
load_state

# ============================================================
# Prompt helpers
# ============================================================
prompt_default() {
    local prompt="$1"
    local default="$2"
    local result
    read -rp "$(echo -e "${BLUE}>${RESET} ${prompt} [${default}]: ")" result
    echo "${result:-$default}"
}

prompt_secret() {
    local prompt="$1"
    local result
    read -rsp "$(echo -e "${BLUE}>${RESET} ${prompt}: ")" result
    echo ""  # newline after hidden input
    echo "$result"
}

prompt_yes_no() {
    local prompt="$1"
    local default="${2:-y}"
    local result
    read -rp "$(echo -e "${BLUE}>${RESET} ${prompt} [${default}]: ")" result
    result="${result:-$default}"
    [[ "$result" =~ ^[Yy] ]]
}

# ============================================================
# 1. PREFLIGHT CHECKS
# ============================================================
header "Preflight Checks"

check_cmd() {
    local cmd="$1"
    local install_hint="$2"
    if ! command -v "$cmd" &>/dev/null; then
        error "'${cmd}' not found."
        error "  Install: ${install_hint}"
        return 1
    fi
    success "${cmd} found: $(command -v "$cmd")"
    return 0
}

PREFLIGHT_OK=true

check_cmd git "https://git-scm.com/downloads" || PREFLIGHT_OK=false

# python3 >= 3.10
if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
        error "python3 ${PY_VERSION} found, but 3.10+ is required."
        error "  Install: https://www.python.org/downloads/"
        PREFLIGHT_OK=false
    else
        success "python3 ${PY_VERSION} found"
    fi
else
    error "'python3' not found."
    error "  Install: https://www.python.org/downloads/"
    PREFLIGHT_OK=false
fi

# node >= 18
if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        error "node v${NODE_VERSION} found, but v18+ is required."
        error "  Install: https://nodejs.org/en/download/"
        PREFLIGHT_OK=false
    else
        success "node v${NODE_VERSION} found"
    fi
else
    error "'node' not found."
    error "  Install: https://nodejs.org/en/download/"
    PREFLIGHT_OK=false
fi

# claude (Claude Code CLI)
if ! check_cmd claude "https://docs.anthropic.com/en/docs/claude-code/setup"; then
    PREFLIGHT_OK=false
fi

if [ "$PREFLIGHT_OK" != "true" ]; then
    die "Preflight failed — fix the issues above and re-run."
fi

success "All preflight checks passed."

# ============================================================
# 2. PROMPTS (with state resume)
# ============================================================
header "Configuration"

# --- Workspace ---
DEFAULT_WORKSPACE="${SAVED_WORKSPACE:-$(pwd)}"
WORKSPACE=$(prompt_default "Workspace location" "$DEFAULT_WORKSPACE")
WORKSPACE="${WORKSPACE/#\~/$HOME}"

# --- HuggingFace token ---
HF_TOKEN="${SAVED_HF_TOKEN:-}"
HF_USERNAME="${SAVED_HF_USERNAME:-}"

validate_hf_token() {
    local token="$1"
    # First ensure huggingface_hub is available
    if ! python3 -c "import huggingface_hub" 2>/dev/null; then
        info "Installing huggingface_hub for token validation..."
        pip install --quiet huggingface_hub 2>/dev/null || python3 -m pip install --quiet huggingface_hub 2>/dev/null || true
    fi

    local username
    username=$(python3 -c "
from huggingface_hub import HfApi
import sys
try:
    api = HfApi(token='${token}')
    info = api.whoami()
    print(info['name'])
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
" 2>/tmp/dcc_hf_error)

    if [ $? -eq 0 ] && [ -n "$username" ]; then
        HF_USERNAME="$username"
        return 0
    else
        local err_msg
        err_msg=$(cat /tmp/dcc_hf_error 2>/dev/null || echo "Unknown error")
        rm -f /tmp/dcc_hf_error
        error "Token validation failed: ${err_msg}"
        return 1
    fi
}

if [ -n "$HF_TOKEN" ] && [ -n "$HF_USERNAME" ]; then
    success "Using saved HuggingFace token (user: ${HF_USERNAME})"
    if ! prompt_yes_no "Keep this token? (y/n)" "y"; then
        HF_TOKEN=""
        HF_USERNAME=""
    fi
fi

if [ -z "$HF_TOKEN" ]; then
    echo ""
    info "A HuggingFace token is needed to deploy your dashboard."
    info "Create one at: ${BOLD}https://huggingface.co/settings/tokens${RESET} (needs write access)"
    echo ""

    MAX_ATTEMPTS=3
    ATTEMPT=0
    while [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; do
        HF_TOKEN=$(prompt_secret "HuggingFace token (input hidden)")

        if [ -z "$HF_TOKEN" ]; then
            warn "No token entered."
            if prompt_yes_no "Skip HuggingFace setup? You can add it later." "n"; then
                HF_TOKEN=""
                break
            fi
            continue
        fi

        info "Validating token..."
        if validate_hf_token "$HF_TOKEN"; then
            success "Authenticated as: ${HF_USERNAME}"
            break
        else
            ATTEMPT=$((ATTEMPT + 1))
            if [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; then
                warn "Try again (attempt $((ATTEMPT + 1))/${MAX_ATTEMPTS})."
                warn "Make sure the token has write access and is not expired."
                HF_TOKEN=""
            else
                warn "Max attempts reached."
                if prompt_yes_no "Skip HuggingFace setup? You can add it later." "y"; then
                    HF_TOKEN=""
                    break
                fi
                ATTEMPT=0  # let them keep trying
            fi
        fi
    done
fi

# --- HF org ---
HF_ORG_DEFAULT="${SAVED_HF_ORG:-${HF_USERNAME:-your-hf-username}}"
HF_ORG=$(prompt_default "HuggingFace org or username (for dashboard Space)" "$HF_ORG_DEFAULT")

# Save state after prompts
CURRENT_PHASE="workspace"
save_state

# ============================================================
# 3. WORKSPACE SETUP
# ============================================================
header "Workspace Setup"

# Clone repo to temp dir
TMPDIR_DCC=$(mktemp -d)
info "Cloning Dr-Claude-Code to temporary directory..."
git clone --depth=1 "$REPO_URL" "${TMPDIR_DCC}/Dr-Claude-Code" 2>&1 | \
    sed "s/^/  /" || die "Failed to clone repository."
REPO_DIR="${TMPDIR_DCC}/Dr-Claude-Code"

# Create workspace directories
info "Creating workspace at: ${WORKSPACE}"
mkdir -p \
    "${WORKSPACE}/notes/experiments" \
    "${WORKSPACE}/packages"

# Copy project components
COPY_DIRS=(tools templates docs)
for d in "${COPY_DIRS[@]}"; do
    src="${REPO_DIR}/${d}"
    dst="${WORKSPACE}/${d}"
    if [ -d "$src" ]; then
        info "Syncing ${d}/ ..."
        if command -v rsync &>/dev/null; then
            rsync -a --exclude='node_modules' --exclude='__pycache__' \
                  --exclude='.venv' "${src}/" "${dst}/"
        else
            cp -rn "${src}/." "${dst}/" 2>/dev/null || true
        fi
    fi
done

# .claude/ — don't overwrite if already exists
CLAUDE_DST="${WORKSPACE}/.claude"
if [ -d "$CLAUDE_DST" ]; then
    warn ".claude/ already exists — skipping to preserve your config."
else
    info "Installing .claude/ config kit..."
    cp -r "${REPO_DIR}/.claude" "${CLAUDE_DST}"
fi

# Create tools venv + install dcc
TOOLS_VENV="${WORKSPACE}/.tools-venv"
if [ ! -d "$TOOLS_VENV" ]; then
    info "Creating tools venv at ${TOOLS_VENV} ..."
    python3 -m venv "$TOOLS_VENV"
fi

info "Installing dcc CLI..."
"${TOOLS_VENV}/bin/pip" install --quiet --upgrade pip 2>/dev/null
"${TOOLS_VENV}/bin/pip" install --quiet huggingface_hub 2>/dev/null || true

CLI_DIR="${WORKSPACE}/tools/cli"
if [ -d "$CLI_DIR" ] && [ -f "${CLI_DIR}/pyproject.toml" ]; then
    "${TOOLS_VENV}/bin/pip" install --quiet -e "$CLI_DIR"
fi

# Verify dcc
if "${TOOLS_VENV}/bin/dcc" --version &>/dev/null 2>&1; then
    DCC_VERSION=$("${TOOLS_VENV}/bin/dcc" --version 2>&1 | head -1)
    success "dcc installed: ${DCC_VERSION}"
else
    warn "dcc install issue — check ${TOOLS_VENV}"
fi

CURRENT_PHASE="dashboard"
save_state

# ============================================================
# 4. DASHBOARD DEPLOY
# ============================================================
header "Dashboard Deploy"

DASHBOARD_URL=""

if [ -z "$HF_TOKEN" ]; then
    warn "No HuggingFace token — skipping dashboard deploy."
    warn "Re-run the installer later with a token, or ask Claude to help you deploy."
else
    VISUALIZER_DIR="${WORKSPACE}/tools/visualizer"
    FRONTEND_DIR="${VISUALIZER_DIR}/frontend"
    DEPLOY_OK=true

    # Build frontend
    if [ -d "$FRONTEND_DIR" ] && [ -f "${FRONTEND_DIR}/package.json" ]; then
        info "Building visualizer frontend..."
        (
            cd "$FRONTEND_DIR"
            npm install --silent 2>&1 | tail -3
            npm run build 2>&1 | tail -5
        ) || { warn "Frontend build failed — skipping dashboard deploy."; DEPLOY_OK=false; }
    else
        warn "Frontend source not found — skipping build."
        DEPLOY_OK=false
    fi

    if [ "$DEPLOY_OK" = "true" ]; then
        SPACE_NAME="dr-claude-dashboard"
        SPACE_ID="${HF_ORG}/${SPACE_NAME}"
        info "Creating HuggingFace Space: ${SPACE_ID} ..."

        "${TOOLS_VENV}/bin/python" - <<PYEOF || { warn "Space creation failed — you can push manually later."; DEPLOY_OK=false; }
from huggingface_hub import HfApi
api = HfApi(token="${HF_TOKEN}")
try:
    api.create_repo(
        repo_id="${SPACE_ID}",
        repo_type="space",
        space_sdk="docker",
        exist_ok=True,
        private=False,
    )
    print("Space ready.")
except Exception as e:
    import sys
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
    fi

    if [ "$DEPLOY_OK" = "true" ]; then
        info "Pushing visualizer to HF Space..."
        SPACE_REPO="https://huggingface.co/spaces/${SPACE_ID}"
        (
            cd "$VISUALIZER_DIR"
            if [ ! -d ".git" ]; then
                git init -q
                git remote add space "https://user:${HF_TOKEN}@huggingface.co/spaces/${SPACE_ID}"
            elif ! git remote get-url space &>/dev/null; then
                git remote add space "https://user:${HF_TOKEN}@huggingface.co/spaces/${SPACE_ID}"
            fi
            git add -A
            git diff --cached --quiet || git commit -q -m "deploy: dr-claude-code visualizer"
            git push space HEAD:main --force -q
        ) || warn "Push to HF Space failed — deploy manually from ${VISUALIZER_DIR}."

        DASHBOARD_URL="https://huggingface.co/spaces/${SPACE_ID}"
        success "Dashboard deployed: ${DASHBOARD_URL}"
    fi
fi

# ============================================================
# 5. FINALIZE
# ============================================================
header "Finalizing"

# Inject HF_ORG into .claude/CLAUDE.md
CLAUDE_MD="${WORKSPACE}/.claude/CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
    sed -i.bak "s|\\\$HF_ORG|${HF_ORG}|g" "$CLAUDE_MD" && rm -f "${CLAUDE_MD}.bak"
    success "Injected HF_ORG into .claude/CLAUDE.md"
fi

# Store config
cat > "$DCC_CONFIG_FILE" <<YAML
# Dr-Claude-Code configuration
workspace: ${WORKSPACE}
hf_org: ${HF_ORG}
hf_token: ${HF_TOKEN}
dashboard_url: ${DASHBOARD_URL:-""}
tools_venv: ${WORKSPACE}/.tools-venv
installed_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
YAML
success "Config written to ${DCC_CONFIG_FILE}"

# HF login
if [ -n "$HF_TOKEN" ]; then
    "${TOOLS_VENV}/bin/python" -c "from huggingface_hub import login; login(token='${HF_TOKEN}', add_to_git_credential=False)" 2>/dev/null \
        && success "Logged in to HuggingFace" \
        || warn "HF login failed — run 'huggingface-cli login' manually."
fi

# Clean up install state (successful install)
CURRENT_PHASE="done"
save_state

# ============================================================
# SUCCESS
# ============================================================
echo ""
echo -e "${GREEN}${BOLD}Dr-Claude-Code installed successfully!${RESET}"
echo ""
echo -e "${BOLD}Workspace:${RESET}    ${WORKSPACE}"
if [ -n "${DASHBOARD_URL:-}" ]; then
    echo -e "${BOLD}Dashboard:${RESET}    ${DASHBOARD_URL}"
fi
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo ""
echo "  1. Add dcc to your PATH:"
echo ""
echo "     export PATH=\"${WORKSPACE}/.tools-venv/bin:\$PATH\""
echo ""
echo "     (Add this to your ~/.zshrc or ~/.bashrc to make it permanent)"
echo ""
echo "  2. Open Claude Code in your workspace:"
echo ""
echo "     cd ${WORKSPACE} && claude"
echo ""
echo "  3. Tell Claude:"
echo ""
echo "     > Help me set up my compute cluster"
echo ""

if [ -n "${DASHBOARD_URL:-}" ]; then
    echo -e "${BOLD}Opening dashboard...${RESET}"
    case "$(uname -s)" in
        Darwin) open "$DASHBOARD_URL" ;;
        Linux)  xdg-open "$DASHBOARD_URL" 2>/dev/null || true ;;
    esac
fi

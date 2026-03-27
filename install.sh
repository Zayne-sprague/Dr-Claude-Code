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
# 2. PROMPTS
# ============================================================
header "Configuration"

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

# Workspace location
WORKSPACE=$(prompt_default "Workspace location" "${HOME}/Research")
WORKSPACE="${WORKSPACE/#\~/$HOME}"  # expand leading ~

# HuggingFace token
HF_TOKEN=""
HF_USERNAME=""

info "A HuggingFace token is needed to create your dashboard Space."
info "Create one at: https://huggingface.co/settings/tokens (write access)"
HF_TOKEN=$(prompt_secret "HuggingFace token (input hidden)")

if [ -z "$HF_TOKEN" ]; then
    warn "No HuggingFace token provided — skipping dashboard deploy."
else
    # Validate token and get username
    info "Validating HuggingFace token..."
    HF_USERNAME=$(python3 - <<PYEOF 2>/dev/null
import sys
try:
    from huggingface_hub import HfApi
    api = HfApi(token="${HF_TOKEN}")
    info = api.whoami()
    print(info["name"])
except ImportError:
    # huggingface_hub not installed yet — skip validation
    print("")
except Exception as e:
    print("", file=sys.stderr)
    sys.exit(1)
PYEOF
    ) || { warn "Token validation failed — continuing without HF integration."; HF_TOKEN=""; }

    if [ -n "$HF_USERNAME" ]; then
        success "Authenticated as: ${HF_USERNAME}"
    fi
fi

# HF org / username
HF_ORG_DEFAULT="${HF_USERNAME:-your-hf-username}"
HF_ORG=$(prompt_default "HuggingFace org or username (for dashboard Space)" "$HF_ORG_DEFAULT")

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

# Copy project components (idempotent: only copy if target doesn't exist for .claude/)
COPY_DIRS=(tools templates docs)
for d in "${COPY_DIRS[@]}"; do
    src="${REPO_DIR}/${d}"
    dst="${WORKSPACE}/${d}"
    if [ -d "$src" ]; then
        info "Syncing ${d}/ ..."
        # rsync is idempotent and only updates changed files
        if command -v rsync &>/dev/null; then
            rsync -a --exclude='node_modules' --exclude='__pycache__' \
                  --exclude='.venv' "${src}/" "${dst}/"
        else
            cp -rn "${src}/." "${dst}/" 2>/dev/null || true
        fi
    fi
done

# .claude/ — don't overwrite if it already exists
CLAUDE_DST="${WORKSPACE}/.claude"
if [ -d "$CLAUDE_DST" ]; then
    warn ".claude/ already exists in workspace — skipping to preserve your config."
else
    info "Installing .claude/ config kit..."
    cp -r "${REPO_DIR}/.claude" "${CLAUDE_DST}"
fi

# Create and populate tools venv
TOOLS_VENV="${WORKSPACE}/.tools-venv"
if [ ! -d "$TOOLS_VENV" ]; then
    info "Creating tools venv at ${TOOLS_VENV} ..."
    python3 -m venv "$TOOLS_VENV"
fi

info "Installing dcc CLI into tools venv..."
"${TOOLS_VENV}/bin/pip" install --quiet --upgrade pip

CLI_DIR="${WORKSPACE}/tools/cli"
if [ -d "$CLI_DIR" ] && [ -f "${CLI_DIR}/pyproject.toml" ]; then
    "${TOOLS_VENV}/bin/pip" install --quiet -e "$CLI_DIR"
elif [ -d "${REPO_DIR}/tools/cli" ] && [ -f "${REPO_DIR}/tools/cli/pyproject.toml" ]; then
    "${TOOLS_VENV}/bin/pip" install --quiet -e "${REPO_DIR}/tools/cli"
else
    warn "dcc CLI source not found — skipping CLI install."
fi

# Verify dcc
if "${TOOLS_VENV}/bin/dcc" --version &>/dev/null 2>&1; then
    DCC_VERSION=$("${TOOLS_VENV}/bin/dcc" --version 2>&1 | head -1)
    success "dcc installed: ${DCC_VERSION}"
else
    warn "dcc --version check skipped (CLI may not be fully installed yet)."
fi

# ============================================================
# 4. DASHBOARD DEPLOY
# ============================================================
header "Dashboard Deploy"

DASHBOARD_URL=""

if [ -z "$HF_TOKEN" ]; then
    warn "No HuggingFace token — skipping dashboard deploy."
    warn "Re-run with a token later, or manually push to a HF Space."
else
    VISUALIZER_DIR="${WORKSPACE}/tools/visualizer"
    FRONTEND_DIR="${VISUALIZER_DIR}/frontend"

    # Build frontend
    if [ -d "$FRONTEND_DIR" ] && [ -f "${FRONTEND_DIR}/package.json" ]; then
        info "Building visualizer frontend..."
        (
            cd "$FRONTEND_DIR"
            npm install --silent 2>&1 | tail -5
            npm run build 2>&1 | tail -10
        ) || { warn "Frontend build failed — skipping dashboard deploy."; goto_finalize=true; }
    else
        warn "Frontend source not found at ${FRONTEND_DIR} — skipping build."
        goto_finalize=true
    fi

    if [ "${goto_finalize:-false}" != "true" ]; then
        SPACE_NAME="dr-claude-dashboard"
        SPACE_ID="${HF_ORG}/${SPACE_NAME}"
        info "Creating HuggingFace Space: ${SPACE_ID} ..."

        python3 - <<PYEOF || warn "Space creation failed — you can push manually later."
import sys
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
    print(f"Warning: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF

        # Push visualizer to HF Space via git
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
    if grep -q "HF_ORG" "$CLAUDE_MD" 2>/dev/null; then
        # Replace existing placeholder
        sed -i.bak "s|HF_ORG:.*|HF_ORG: ${HF_ORG}|g" "$CLAUDE_MD" && rm -f "${CLAUDE_MD}.bak"
    else
        # Append config block
        printf '\n## Install Config\n\n- HF_ORG: %s\n- workspace: %s\n' \
            "$HF_ORG" "$WORKSPACE" >> "$CLAUDE_MD"
    fi
    success "Injected HF_ORG into .claude/CLAUDE.md"
fi

# Store ~/.dcc/config.yaml
mkdir -p "$DCC_CONFIG_DIR"
cat > "$DCC_CONFIG_FILE" <<YAML
# Dr-Claude-Code configuration
# Generated by install.sh

workspace: ${WORKSPACE}
hf_org: ${HF_ORG}
dashboard_url: ${DASHBOARD_URL:-""}
tools_venv: ${WORKSPACE}/.tools-venv
installed_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
YAML
success "Config written to ${DCC_CONFIG_FILE}"

# HF login
if [ -n "$HF_TOKEN" ]; then
    info "Running huggingface-cli login..."
    python3 - <<PYEOF 2>/dev/null || warn "HF login failed — run 'huggingface-cli login' manually."
from huggingface_hub import login
login(token="${HF_TOKEN}", add_to_git_credential=False)
PYEOF
    success "Logged in to HuggingFace as ${HF_ORG}"
fi

# ============================================================
# SUCCESS
# ============================================================
echo ""
echo -e "${GREEN}${BOLD}Dr-Claude-Code installed successfully!${RESET}"
echo ""
echo -e "${BOLD}Workspace:${RESET}    ${WORKSPACE}"
echo -e "${BOLD}Config:${RESET}       ${DCC_CONFIG_FILE}"
if [ -n "${DASHBOARD_URL:-}" ]; then
    echo -e "${BOLD}Dashboard:${RESET}    ${DASHBOARD_URL}"
fi
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo "  1. Add dcc to your PATH:"
echo "       echo 'export PATH=\"${WORKSPACE}/.tools-venv/bin:\$PATH\"' >> ~/.zshrc"
echo "       source ~/.zshrc"
echo ""
echo "  2. Open Claude Code in your workspace:"
echo "       claude ${WORKSPACE}"
echo ""
echo "  3. (Optional) On each HPC cluster, run:"
echo "       dcc cluster-setup --workspace ${WORKSPACE}"
echo ""
if [ -n "${DASHBOARD_URL:-}" ]; then
    echo -e "${BOLD}Opening dashboard in browser...${RESET}"
    case "$(uname -s)" in
        Darwin) open "$DASHBOARD_URL" ;;
        Linux)  xdg-open "$DASHBOARD_URL" 2>/dev/null || true ;;
    esac
fi

#!/usr/bin/env bash
# Setup Agent Deck + create a Dr Claude Code session
# Called by onboarding — user just runs this and they're ready.
set -uo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[dcc]${RESET} $*"; }
success() { echo -e "${GREEN}[dcc]${RESET} $*"; }
error()   { echo -e "${RED}[dcc]${RESET} $*" >&2; }

WORKSPACE="${1:-$(pwd)}"

# ── Install Agent Deck ────────────────────────────────
if command -v agent-deck &>/dev/null; then
    success "Agent Deck already installed: $(agent-deck --version 2>/dev/null || echo 'found')"
else
    info "Installing Agent Deck..."
    curl -fsSL https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/install.sh | bash
    echo ""

    if ! command -v agent-deck &>/dev/null; then
        error "Agent Deck install may need a shell restart."
        error "Try: source ~/.zshrc  (or ~/.bashrc), then re-run this script."
        exit 1
    fi
    success "Agent Deck installed"
fi

# ── Create session ────────────────────────────────────
info "Creating Dr Claude Code session..."
agent-deck add -t "Dr Claude Code" -c claude "${WORKSPACE}" -g "research" 2>/dev/null \
    && success "Session created in 'research' group" \
    || info "Session may already exist"

echo ""
success "Ready! Run:"
echo ""
echo "  agent-deck"
echo ""
echo "  Then select 'Dr Claude Code' and press Enter."
echo "  Say 'resume onboarding' to pick up where you left off."
echo ""

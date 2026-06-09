#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  MGG — one-line bootstrap installer.
#
#  Installs MGG on a fresh Ubuntu (22.04 / 24.04) host with a single line:
#
#    curl -fsSL https://raw.githubusercontent.com/Micka420-collab/mgg_panel/main/deploy/get.sh | sudo bash
#
#  Optional environment overrides (forwarded to deploy/install.sh):
#    APP_DOMAIN=panel.example.com   NODE_PUBLIC_IP=1.2.3.4   APPLY_FIREWALL=1
#
#  This script only clones/updates the repo and hands off to deploy/install.sh.
#  It is idempotent: safe to run again to pull the latest code and re-deploy.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (overridable via env) ───────────────────────────────────────────
REPO_URL="${MGG_REPO_URL:-https://github.com/Micka420-collab/mgg_panel.git}"
REPO_BRANCH="${MGG_REPO_BRANCH:-main}"
INSTALL_DIR="${MGG_INSTALL_DIR:-/opt/mgg}"

# ── Pretty output ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  GREEN='\033[0;32m'; CYAN='\033[0;36m'; YEL='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
else
  GREEN=''; CYAN=''; YEL=''; RED=''; NC=''
fi
say()  { echo -e "${CYAN}▸${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YEL}!${NC} $*"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

echo -e "${CYAN}"
echo "   ╔═══════════════════════════════════════╗"
echo "   ║         MGG · bootstrap            ║"
echo "   ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Must be root ────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  die "Please run as root. Re-run with:  curl -fsSL <url>/deploy/get.sh | sudo bash"
fi

# ── 2. Ensure git is installed ─────────────────────────────────────────────
if ! command -v git >/dev/null 2>&1; then
  say "git not found — installing…"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y git
  else
    die "git is missing and apt-get is unavailable. Install git manually, then re-run."
  fi
  ok "git installed ($(git --version))"
else
  ok "git present ($(git --version))"
fi

# ── 3. Clone (or update) the repo into INSTALL_DIR ─────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  say "Existing install found at ${INSTALL_DIR} — pulling latest…"
  git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL" || true
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$REPO_BRANCH"
  git -C "$INSTALL_DIR" checkout -B "$REPO_BRANCH" "origin/$REPO_BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH"
  ok "Repository updated to latest ${REPO_BRANCH}"
elif [ -e "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
  die "${INSTALL_DIR} exists but is not a git checkout and is not empty. Move it aside or set MGG_INSTALL_DIR, then re-run."
else
  say "Cloning ${REPO_URL} (branch ${REPO_BRANCH}) into ${INSTALL_DIR}…"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  ok "Repository cloned"
fi

# ── 4. Hand off to the real installer ──────────────────────────────────────
INSTALLER="$INSTALL_DIR/deploy/install.sh"
[ -f "$INSTALLER" ] || die "Installer not found at ${INSTALLER} (unexpected repo layout)."

say "Launching deploy/install.sh…"
echo
# Forward any user-provided env. install.sh already reads APP_DOMAIN,
# NODE_PUBLIC_IP and APPLY_FIREWALL from the environment, so a plain exec
# (which preserves the environment) is all that is needed. cd first so the
# installer's relative paths and docker compose context resolve correctly.
cd "$INSTALL_DIR"
exec bash "$INSTALLER"

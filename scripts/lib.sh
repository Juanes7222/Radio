#!/usr/bin/env bash

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

DEPLOY_DIR="/var/www/radio"
BACKEND_DIR="$DEPLOY_DIR/apps/backend"
FRONTEND_DIR="$DEPLOY_DIR/apps/web"
SCRIPTS_DIR="$DEPLOY_DIR/scripts"

NGINX_CONF="/etc/nginx/sites-available/radio"
NGINX_GLOBAL_CONF="/etc/nginx/conf.d/radio-global.conf"

BACKEND_SERVICE="radio-backend"
SERVICE_USER="${SERVICE_USER:-radio}"

_log() {
  local level="$1"; shift
  local msg="$*"
  local ts; ts="$(date '+%H:%M:%S')"
  [[ -n "${DEPLOY_LOG:-}" ]] && echo "[$ts][$level] $msg" >> "$DEPLOY_LOG"
  case $level in
    INFO)  echo -e "${GREEN}[${ts}]${NC} $msg" ;;
    WARN)  echo -e "${YELLOW}[${ts}] WARN${NC} $msg" ;;
    ERROR) echo -e "${RED}[${ts}] ERROR${NC} $msg" >&2 ;;
    STEP)  echo -e "\n${BOLD}${CYAN}══ $msg${NC}" ;;
  esac
}

info()  { _log INFO  "$@"; }
warn()  { _log WARN  "$@"; }
error() { _log ERROR "$@"; }
step()  { _log STEP  "$@"; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}ERROR:${NC} This script must be run as root." >&2
    exit 1
  fi
}
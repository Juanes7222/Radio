#!/usr/bin/env bash

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

DEPLOY_DIR="/var/www/radio"
BACKEND_DIR="$DEPLOY_DIR/backend"
FRONTEND_DIR="$DEPLOY_DIR/apps/web"
SCRIPTS_DIR="$DEPLOY_DIR/scripts"

NGINX_CONF="/etc/nginx/sites-available/radio"
NGINX_GLOBAL_CONF="/etc/nginx/conf.d/radio-global.conf"

BACKEND_SERVICE="radio-backend"
SERVICE_USER="${SERVICE_USER:-radio}"

KOKORO_URL="${KOKORO_URL:-http://127.0.0.1:8880}"
KOKORO_HEALTH_URL="${KOKORO_URL}/health"
KOKORO_RETRIES=6
KOKORO_INTERVAL=5

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

apply_permissions() {
  local deploy_backend="${1:-false}"
  local deploy_frontend="${2:-false}"

  if [[ "$deploy_frontend" == "true" ]] && [[ -d "$FRONTEND_DIR/dist" ]]; then
    chown -R www-data:www-data "$FRONTEND_DIR/dist"
    chmod -R 750 "$FRONTEND_DIR/dist"
  fi

  if [[ "$deploy_backend" == "true" ]] && [[ -d "$BACKEND_DIR/dist" ]]; then
    chown -R "$SERVICE_USER:$SERVICE_USER" "$BACKEND_DIR/dist"
    chmod -R 750 "$BACKEND_DIR/dist"
  fi

  if [[ -f "$BACKEND_DIR/.env" ]]; then
    chown "root:$SERVICE_USER" "$BACKEND_DIR/.env"
    chmod 640 "$BACKEND_DIR/.env"
  fi
}

ensure_kokoro() {
  local healthy=false

  for i in $(seq 1 "$KOKORO_RETRIES"); do
    if curl -sf --max-time 3 "$KOKORO_HEALTH_URL" &>/dev/null; then
      info "Kokoro TTS is responding (attempt $i)."
      return 0
    fi
    info "Kokoro not responding — attempt $i/$KOKORO_RETRIES, waiting ${KOKORO_INTERVAL}s..."
    sleep "$KOKORO_INTERVAL"
  done

  warn "Kokoro TTS is not running. Attempting to start..."

  if systemctl list-unit-files | grep -q "^kokoro"; then
    info "Found kokoro systemd service. Starting..."
    systemctl start kokoro || true
    sleep 3
    for i in $(seq 1 "$KOKORO_RETRIES"); do
      if curl -sf --max-time 3 "$KOKORO_HEALTH_URL" &>/dev/null; then
        info "Kokoro systemd service started successfully."
        return 0
      fi
      sleep "$KOKORO_INTERVAL"
    done
    error "Kokoro systemd service failed to start."
    return 1
  fi

  if command -v docker &>/dev/null; then
    info "Attempting to start Kokoro via Docker..."
    if docker ps -a --format '{{.Names}}' | grep -q "^kokoro$"; then
      docker start kokoro || true
    else
      warn "No Kokoro container named 'kokoro' found. Please create it manually:"
      warn "  docker run -d --name kokoro -p 8880:8880 <kokoro-image>"
      warn "Skipping Kokoro auto-start. The backend will retry synthesis at runtime."
      return 0
    fi
    sleep 3
    for i in $(seq 1 "$KOKORO_RETRIES"); do
      if curl -sf --max-time 3 "$KOKORO_HEALTH_URL" &>/dev/null; then
        info "Kokoro Docker container started successfully."
        return 0
      fi
      sleep "$KOKORO_INTERVAL"
    done
    error "Kokoro Docker container failed to start."
    return 1
  fi

  warn "No Kokoro service or Docker detected. Skipping auto-start."
  warn "The backend will attempt to connect to Kokoro at runtime."
  return 0
}
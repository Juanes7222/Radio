#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — Zero-downtime deployment script
#
# USAGE:
#   bash deploy.sh [--backend] [--frontend] [--skip-audit] [--force]
#
# OPTIONS:
#   --backend      Deploy only the backend
#   --frontend     Deploy only the frontend
#   --skip-audit   Skip npm audit (NOT recommended in production)
#   --force        Deploy even if there are no repo changes
#
# If neither --backend nor --frontend is specified, both are deployed.
# ==============================================================================

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

DEPLOY_LOG="/var/log/radio-deploy.log"
LOCK_FILE="/tmp/radio-deploy.lock"
HEALTH_URL="http://127.0.0.1:3000/health"
HEALTH_RETRIES=12
HEALTH_INTERVAL=5

SKIP_AUDIT=false
FORCE_DEPLOY=false
DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false

for arg in "$@"; do
  case $arg in
    --skip-audit) SKIP_AUDIT=true ;;
    --force)      FORCE_DEPLOY=true ;;
    --backend)    DEPLOY_BACKEND=true ;;
    --frontend)   DEPLOY_FRONTEND=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# Default to full deploy when no target is specified.
if [[ "$DEPLOY_BACKEND" == "false" ]] && [[ "$DEPLOY_FRONTEND" == "false" ]]; then
  DEPLOY_BACKEND=true
  DEPLOY_FRONTEND=true
fi

require_root

if [[ -f "$LOCK_FILE" ]]; then
  LOCK_PID="$(cat "$LOCK_FILE" 2>/dev/null || echo '?')"
  error "Another deploy is already running (PID: $LOCK_PID). Aborting."
  exit 1
fi
echo $$ > "$LOCK_FILE"

DEPLOY_START="$(date '+%Y-%m-%d %H:%M:%S')"
BACKUP_BACKEND=""
BACKUP_WEB=""
NGINX_RELOADED=false

cleanup() {
  local exit_code=$?
  rm -f "$LOCK_FILE"
  if [[ $exit_code -ne 0 ]]; then
    error "Deploy failed (exit code: $exit_code). Starting rollback..."
    echo "[$DEPLOY_START → $(date '+%Y-%m-%d %H:%M:%S')] FAILED (exit: $exit_code)" \
      >> "$DEPLOY_LOG"
    rollback
  fi
}
trap cleanup EXIT

rollback() {
  warn "══ ROLLBACK STARTED ═════════════════════════════"

  if [[ -n "$BACKUP_BACKEND" ]] && [[ -d "$BACKUP_BACKEND" ]]; then
    warn "  Restoring backend build..."
    rm -rf "$BACKEND_DIR/dist"
    mv "$BACKUP_BACKEND" "$BACKEND_DIR/dist" \
      || { warn "  mv failed; removing orphaned backup..."; rm -rf "$BACKUP_BACKEND" || true; }
  fi

  if [[ -n "$BACKUP_WEB" ]] && [[ -d "$BACKUP_WEB" ]]; then
    warn "  Restoring web build..."
    rm -rf "$FRONTEND_DIR/dist"
    mv "$BACKUP_WEB" "$FRONTEND_DIR/dist" \
      || { warn "  mv failed; removing orphaned backup..."; rm -rf "$BACKUP_WEB" || true; }
  fi

  if [[ "$NGINX_RELOADED" == "true" ]] && [[ -f "${NGINX_CONF}.bak" ]]; then
    warn "  Restoring Nginx configuration..."
    cp "${NGINX_CONF}.bak" "$NGINX_CONF"
    nginx -t 2>/dev/null && systemctl reload nginx || true
  fi

  if [[ "$DEPLOY_BACKEND" == "true" ]]; then
    warn "  Restarting backend with previous version..."
    systemctl restart "$BACKEND_SERVICE" || true
  fi

  _apply_permissions

  warn "Rollback completed. Manual verification recommended."
  warn "  journalctl -u $BACKEND_SERVICE -n 50"
  warn "═════════════════════════════════════════════════"
}

_apply_permissions() {
  if [[ "$DEPLOY_FRONTEND" == "true" ]] && [[ -d "$FRONTEND_DIR/dist" ]]; then
    chown -R www-data:www-data "$FRONTEND_DIR/dist"
    chmod -R 750 "$FRONTEND_DIR/dist"
  fi

  if [[ "$DEPLOY_BACKEND" == "true" ]] && [[ -d "$BACKEND_DIR/dist" ]]; then
    chown -R "$SERVICE_USER:$SERVICE_USER" "$BACKEND_DIR/dist"
    chmod -R 750 "$BACKEND_DIR/dist"
  fi

  if [[ -f "$BACKEND_DIR/.env" ]]; then
    chown "root:$SERVICE_USER" "$BACKEND_DIR/.env"
    chmod 640 "$BACKEND_DIR/.env"
  fi
}

_target_label() {
  local labels=()
  [[ "$DEPLOY_BACKEND"  == "true" ]] && labels+=("backend")
  [[ "$DEPLOY_FRONTEND" == "true" ]] && labels+=("frontend")
  echo "${labels[*]}"
}

echo "" >> "$DEPLOY_LOG"
echo "═══════════════════════════════════════════" >> "$DEPLOY_LOG"
info "Deploy started: $DEPLOY_START"
info "Targets: $(_target_label)"

cd "$DEPLOY_DIR"

step "1/8 — Ensuring Kokoro TTS service is running"

_KOKORO_URL="${KOKORO_URL:-http://127.0.0.1:8880}"
_KOKORO_HEALTH_URL="${_KOKORO_URL}/health"
_KOKORO_RETRIES=6
_KOKORO_INTERVAL=5

ensure_kokoro() {
  local healthy=false
  for i in $(seq 1 "$_KOKORO_RETRIES"); do
    if curl -sf --max-time 3 "$_KOKORO_HEALTH_URL" &>/dev/null; then
      healthy=true
      info "Kokoro TTS is responding (attempt $i)."
      break
    fi
    info "Kokoro not responding — attempt $i/$_KOKORO_RETRIES, waiting ${_KOKORO_INTERVAL}s..."
    sleep "$_KOKORO_INTERVAL"
  done

  if [[ "$healthy" == "true" ]]; then
    return 0
  fi

  warn "Kokoro TTS is not running. Attempting to start..."

  # Try systemd service first
  if systemctl list-unit-files | grep -q "^kokoro"; then
    info "Found kokoro systemd service. Starting..."
    systemctl start kokoro || true
    sleep 3
    for i in $(seq 1 "$_KOKORO_RETRIES"); do
      if curl -sf --max-time 3 "$_KOKORO_HEALTH_URL" &>/dev/null; then
        info "Kokoro systemd service started successfully."
        return 0
      fi
      sleep "$_KOKORO_INTERVAL"
    done
    error "Kokoro systemd service failed to start."
    return 1
  fi

  # Try Docker container as fallback
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
    for i in $(seq 1 "$_KOKORO_RETRIES"); do
      if curl -sf --max-time 3 "$_KOKORO_HEALTH_URL" &>/dev/null; then
        info "Kokoro Docker container started successfully."
        return 0
      fi
      sleep "$_KOKORO_INTERVAL"
    done
    error "Kokoro Docker container failed to start."
    return 1
  fi

  warn "No Kokoro service or Docker detected. Skipping auto-start."
  warn "The backend will attempt to connect to Kokoro at runtime."
  return 0
}

ensure_kokoro || {
  warn "Kokoro TTS is unavailable. The backend may fail to generate audio announcements."
}

step "2/8 — Checking repository changes"

BEFORE_HASH="$(git rev-parse HEAD)"
git fetch --quiet origin
REMOTE_HASH="$(git rev-parse @{u})"

if [[ "$BEFORE_HASH" == "$REMOTE_HASH" ]] && [[ "$FORCE_DEPLOY" == "false" ]]; then
  info "No new commits detected (${BEFORE_HASH:0:8})."
  info "Use --force to deploy anyway."
  trap - EXIT
  rm -f "$LOCK_FILE"
  exit 0
fi

# Discard any local modifications and reset to the remote tracking branch.
# This ensures manual edits on the server never block or corrupt a deploy.
git reset --hard "@{u}"
git submodule update --init --recursive
AFTER_HASH="$(git rev-parse HEAD)"
info "Updated: ${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}"

git log --oneline "${BEFORE_HASH}..${AFTER_HASH}" | while read -r line; do
  info "  commit: $line"
done

step "3/8 — Dependency audit"

if [[ "$SKIP_AUDIT" == "true" ]]; then
  warn "Audit skipped via --skip-audit. Proceed with caution."
else
  if git diff --name-only "$BEFORE_HASH" "$AFTER_HASH" | grep -q "package.*\.json"; then
    info "package.json changed — running pnpm audit..."
    pnpm audit --audit-level=high || {
      error "High severity vulnerabilities detected. Aborting deploy."
      exit 1
    }
  else
    info "No dependency changes detected. Skipping audit."
  fi
fi

step "4/8 — Installing dependencies"
pnpm install --ignore-scripts

step "5/8 — Building applications"

if [[ "$DEPLOY_BACKEND" == "true" ]] && [[ -d "$BACKEND_DIR/dist" ]]; then
  BACKUP_BACKEND="$(mktemp -d)"
  cp -r "$BACKEND_DIR/dist/." "$BACKUP_BACKEND"
fi

if [[ "$DEPLOY_FRONTEND" == "true" ]] && [[ -d "$FRONTEND_DIR/dist" ]]; then
  BACKUP_WEB="$(mktemp -d)"
  cp -r "$FRONTEND_DIR/dist/." "$BACKUP_WEB"
fi

if [[ "$DEPLOY_BACKEND" == "true" ]]; then
  info "Generating Prisma client..."
  pnpm --filter ./backend run prisma:generate

  pnpm --filter ./backend run build
  if [[ ! -d "$BACKEND_DIR/dist" ]] || [[ -z "$(ls -A "$BACKEND_DIR/dist")" ]]; then
    error "Backend build produced no artifacts."
    exit 1
  fi

  info "Applying database migrations..."
  pnpm --filter ./backend exec prisma migrate deploy

  BIBLE_DB="$BACKEND_DIR/prisma/dev.db"
  if [[ ! -f "$BIBLE_DB" ]] || [[ ! -s "$BIBLE_DB" ]]; then
    info "Bible database not found or empty — running seed..."
    pnpm --filter ./backend exec ts-node scripts/seed-bible.ts
  else
    info "Bible database already exists. Skipping seed."
  fi
fi

if [[ "$DEPLOY_FRONTEND" == "true" ]]; then
  pnpm --filter ./apps/web run build
  if [[ ! -d "$FRONTEND_DIR/dist" ]] || [[ -z "$(ls -A "$FRONTEND_DIR/dist")" ]]; then
    error "Frontend build produced no artifacts."
    exit 1
  fi
fi

if [[ "$DEPLOY_FRONTEND" == "true" ]]; then
  pnpm --filter @radio/web run build
  if [[ ! -d "$FRONTEND_DIR/dist" ]] || [[ -z "$(ls -A "$FRONTEND_DIR/dist")" ]]; then
    error "Frontend build produced no artifacts."
    exit 1
  fi
fi

pnpm prune --prod

step "6/8 — Updating Nginx configuration"

NGINX_CHANGED=false
if git diff --name-only "$BEFORE_HASH" "$AFTER_HASH" | \
   grep -qE "scripts/(radio\.nginx\.conf|radio-global\.conf)"; then
  NGINX_CHANGED=true
fi

if [[ "$NGINX_CHANGED" == "true" ]] || [[ "$FORCE_DEPLOY" == "true" ]]; then
  cp "$NGINX_CONF" "${NGINX_CONF}.bak"

  [[ -f "$SCRIPTS_DIR/radio-global.conf" ]] && \
    cp "$SCRIPTS_DIR/radio-global.conf" "$NGINX_GLOBAL_CONF"

  cp "$SCRIPTS_DIR/radio.nginx.conf" "$NGINX_CONF"

  nginx -t && systemctl reload nginx && NGINX_RELOADED=true || {
    error "Invalid Nginx configuration. Rolling back."
    cp "${NGINX_CONF}.bak" "$NGINX_CONF"
    exit 1
  }
else
  info "No Nginx changes detected. Skipping."
fi

step "7/8 — Applying permissions"
_apply_permissions

step "8/8 — Restarting backend and running health check"

if [[ "$DEPLOY_BACKEND" == "true" ]]; then
  systemctl reload-or-restart "$BACKEND_SERVICE"
  info "Waiting for health check..."

  HEALTHY=false
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -sf --max-time 3 "$HEALTH_URL" &>/dev/null; then
      HEALTHY=true
      info "Health check OK (attempt $i)."
      break
    fi
    info "Attempt $i/$HEALTH_RETRIES — waiting ${HEALTH_INTERVAL}s..."
    sleep "$HEALTH_INTERVAL"
  done

  if [[ "$HEALTHY" == "false" ]]; then
    error "Health check failed after $((HEALTH_RETRIES * HEALTH_INTERVAL)) seconds."
    exit 1
  fi
else
  info "Backend not targeted — skipping restart and health check."
fi

if command -v aide &>/dev/null && [[ -f /var/lib/aide/aide.db ]]; then
  info "Updating AIDE database..."
  aide --update 2>/dev/null \
    && mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db \
    || warn "AIDE update failed. Next report may show file changes."
fi

[[ -n "$BACKUP_BACKEND" ]] && rm -rf "$BACKUP_BACKEND"
[[ -n "$BACKUP_WEB"     ]] && rm -rf "$BACKUP_WEB"

DEPLOY_END="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$DEPLOY_START → $DEPLOY_END] SUCCESS (${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}) [targets: $(_target_label)]" \
  >> "$DEPLOY_LOG"

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Deploy completed successfully${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  Targets : $(_target_label)"
echo -e "  Commit  : ${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}"
echo -e "  Nginx   : $(systemctl is-active nginx)"
echo -e "  Backend : $(systemctl is-active "$BACKEND_SERVICE")"
echo -e "  Kokoro  : $(curl -sf --max-time 2 "$_KOKORO_HEALTH_URL" &>/dev/null && echo "active" || echo "inactive")"
echo -e "  Time    : $DEPLOY_END"
echo -e "  Log     : $DEPLOY_LOG"
echo ""
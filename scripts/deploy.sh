#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — Zero-downtime deployment script
#
# USAGE:
#   bash deploy.sh [--skip-audit] [--force]
#
# OPTIONS:
#   --skip-audit   Skip npm audit (NOT recommended in production)
#   --force        Deploy even if there are no repo changes
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
for arg in "$@"; do
  case $arg in
    --skip-audit) SKIP_AUDIT=true ;;
    --force)      FORCE_DEPLOY=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

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

  warn "  Restarting backend with previous version..."
  systemctl restart "$BACKEND_SERVICE" || true

  _apply_permissions

  warn "Rollback completed. Manual verification recommended."
  warn "  journalctl -u $BACKEND_SERVICE -n 50"
  warn "═════════════════════════════════════════════════"
}

_apply_permissions() {
  if [[ -d "$FRONTEND_DIR/dist" ]]; then
    chown -R www-data:www-data "$FRONTEND_DIR/dist"
    chmod -R 750 "$FRONTEND_DIR/dist"
  fi

  if [[ -d "$BACKEND_DIR/dist" ]]; then
    chown -R "$SERVICE_USER:$SERVICE_USER" "$BACKEND_DIR/dist"
    chmod -R 750 "$BACKEND_DIR/dist"
  fi

  if [[ -f "$BACKEND_DIR/.env" ]]; then
    chown "root:$SERVICE_USER" "$BACKEND_DIR/.env"
    chmod 640 "$BACKEND_DIR/.env"
  fi
}

echo "" >> "$DEPLOY_LOG"
echo "═══════════════════════════════════════════" >> "$DEPLOY_LOG"
info "Deploy started: $DEPLOY_START"

cd "$DEPLOY_DIR"

step "1/7 — Checking repository changes"

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

git pull --ff-only
AFTER_HASH="$(git rev-parse HEAD)"
info "Updated: ${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}"

git log --oneline "${BEFORE_HASH}..${AFTER_HASH}" | while read -r line; do
  info "  commit: $line"
done

step "2/7 — Dependency audit"

if [[ "$SKIP_AUDIT" == "true" ]]; then
  warn "Audit skipped via --skip-audit. Proceed with caution."
else
  if git diff --name-only "$BEFORE_HASH" "$AFTER_HASH" | grep -q "package.*\.json"; then
    info "package.json changed — running npm audit..."
    npm audit --audit-level=high || {
      error "High severity vulnerabilities detected. Aborting deploy."
      exit 1
    }
  else
    info "No dependency changes detected. Skipping audit."
  fi
fi

step "3/7 — Installing dependencies"
npm ci --ignore-scripts

step "4/7 — Building applications"

if [[ -d "$BACKEND_DIR/dist" ]]; then
  BACKUP_BACKEND="$(mktemp -d)"
  cp -r "$BACKEND_DIR/dist/." "$BACKUP_BACKEND"
fi

if [[ -d "$FRONTEND_DIR/dist" ]]; then
  BACKUP_WEB="$(mktemp -d)"
  cp -r "$FRONTEND_DIR/dist/." "$BACKUP_WEB"
fi

npm run build --workspace=backend
npm run build --workspace=@radio/web

if [[ ! -d "$BACKEND_DIR/dist" ]] || [[ -z "$(ls -A "$BACKEND_DIR/dist")" ]]; then
  error "Backend build produced no artifacts."
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/dist" ]] || [[ -z "$(ls -A "$FRONTEND_DIR/dist")" ]]; then
  error "Frontend build produced no artifacts."
  exit 1
fi

npm prune --omit=dev

step "5/7 — Updating Nginx configuration"

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

step "6/7 — Applying permissions"
_apply_permissions

step "7/7 — Restarting backend and running health check"

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

if command -v aide &>/dev/null && [[ -f /var/lib/aide/aide.db ]]; then
  info "Updating AIDE database..."
  aide --update 2>/dev/null \
    && mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db \
    || warn "AIDE update failed. Next report may show file changes."
fi

[[ -n "$BACKUP_BACKEND" ]] && rm -rf "$BACKUP_BACKEND"
[[ -n "$BACKUP_WEB"     ]] && rm -rf "$BACKUP_WEB"

DEPLOY_END="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$DEPLOY_START → $DEPLOY_END] SUCCESS (${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8})" \
  >> "$DEPLOY_LOG"

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Deploy completed successfully${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  Commit  : ${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}"
echo -e "  Nginx   : $(systemctl is-active nginx)"
echo -e "  Backend : $(systemctl is-active "$BACKEND_SERVICE")"
echo -e "  Time    : $DEPLOY_END"
echo -e "  Log     : $DEPLOY_LOG"
echo ""
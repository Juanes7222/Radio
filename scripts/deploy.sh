#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — Zero-downtime release deployment
#
# Pulls the latest code, builds the targets, applies DB migrations, reloads
# Nginx if its config changed, restarts the backend, and verifies liveness.
# On any failure the previous build is restored automatically.
#
# USAGE:
#   bash deploy.sh [--backend] [--frontend] [--skip-audit] [--force]
#
# OPTIONS:
#   --backend      Deploy only the backend
#   --frontend     Deploy only the frontend
#   --skip-audit   Skip npm audit (NOT recommended in production)
#   --force        Deploy even if there are no new commits
#
# If neither --backend nor --frontend is specified, both are deployed.
# ==============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

DEPLOY_LOG="/var/log/radio-deploy.log"
LOCK_FILE="/tmp/radio-deploy.lock"

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"

PNPM_BIN="${PNPM_BIN:-pnpm}"
BACKEND_PACKAGE="radio-admin-backend"
WEB_PACKAGE="@radio/web"
INFISICAL_PACKAGE="@radio/infisical-config"

SKIP_AUDIT=false
FORCE_DEPLOY=false
DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false

usage() {
  cat <<'EOF'
Usage:
  bash deploy.sh [--backend] [--frontend] [--skip-audit] [--force]

Options:
  --backend      Deploy only the backend
  --frontend     Deploy only the frontend
  --skip-audit   Skip pnpm audit
  --force        Deploy even if there are no new commits
EOF
}

for arg in "$@"; do
  case "$arg" in
    --skip-audit) SKIP_AUDIT=true ;;
    --force)      FORCE_DEPLOY=true ;;
    --backend)    DEPLOY_BACKEND=true ;;
    --frontend)   DEPLOY_FRONTEND=true ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

if [[ "$DEPLOY_BACKEND" == "false" && "$DEPLOY_FRONTEND" == "false" ]]; then
  DEPLOY_BACKEND=true
  DEPLOY_FRONTEND=true
fi

require_root

command -v "$PNPM_BIN" >/dev/null || { error "pnpm not found"; exit 1; }
command -v git >/dev/null || { error "git not found"; exit 1; }
command -v curl >/dev/null || { error "curl not found"; exit 1; }
command -v systemctl >/dev/null || { error "systemctl not found"; exit 1; }

# Simple lock with stale-file cleanup
if [[ -f "$LOCK_FILE" ]]; then
  LOCK_PID="$(cat "$LOCK_FILE" 2>/dev/null || echo '?')"
  error "Another deploy is already running (PID: $LOCK_PID). Aborting."
  exit 1
fi
echo "$$" > "$LOCK_FILE"

DEPLOY_START="$(date '+%Y-%m-%d %H:%M:%S')"
BACKUP_BACKEND=""
BACKUP_WEB=""
NGINX_RELOADED=false

target_label() {
  local labels=()
  [[ "$DEPLOY_BACKEND" == "true" ]] && labels+=("backend")
  [[ "$DEPLOY_FRONTEND" == "true" ]] && labels+=("frontend")
  echo "${labels[*]}"
}

ensure_backend_dependency_declared() {
  if [[ "$DEPLOY_BACKEND" != "true" ]]; then
    return 0
  fi

  node -e '
    const pkg = require(process.argv[1]);
    const dep = pkg.dependencies && pkg.dependencies["@radio/infisical-config"];
    if (!dep) process.exit(1);
  ' "$BACKEND_DIR/package.json" || {
    error "backend/package.json must declare @radio/infisical-config as a dependency (workspace:*)."
    exit 1
  }
}

dump_backend_debug() {
  warn "  Backend status:"
  systemctl status "$BACKEND_SERVICE" --no-pager -l || true
  warn "  Backend logs:"
  journalctl -u "$BACKEND_SERVICE" -n 100 --no-pager || true
}

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

  apply_permissions "$DEPLOY_BACKEND" "$DEPLOY_FRONTEND"

  warn "Rollback completed. Manual verification recommended."
  warn "  journalctl -u $BACKEND_SERVICE -n 50"
  warn "═════════════════════════════════════════════════"
}

cleanup() {
  local exit_code=$?
  rm -f "$LOCK_FILE"
  if [[ $exit_code -ne 0 ]]; then
    error "Deploy failed (exit code: $exit_code). Starting rollback..."
    echo "[$DEPLOY_START → $(date '+%Y-%m-%d %H:%M:%S')] FAILED (exit: $exit_code)" >> "$DEPLOY_LOG"
    rollback
  fi
}
trap cleanup EXIT INT TERM

echo "" >> "$DEPLOY_LOG"
echo "═══════════════════════════════════════════" >> "$DEPLOY_LOG"
info "Deploy started: $DEPLOY_START"
info "Targets: $(target_label)"

cd "$DEPLOY_DIR"

# ------------------------------------------------------------------------------
# Step 1 — Kokoro TTS
# ------------------------------------------------------------------------------
step "1/8 — Ensuring Kokoro TTS service is running"
ensure_kokoro || {
  warn "Kokoro TTS is unavailable. The backend may fail to generate audio announcements."
}

# ------------------------------------------------------------------------------
# Step 2 — Repository sync
# ------------------------------------------------------------------------------
step "2/8 — Checking repository changes"

BEFORE_HASH="$(git rev-parse HEAD)"
git fetch --quiet origin
REMOTE_HASH="$(git rev-parse @{u})"

if [[ "$BEFORE_HASH" == "$REMOTE_HASH" && "$FORCE_DEPLOY" == "false" ]]; then
  info "No new commits detected (${BEFORE_HASH:0:8})."
  info "Use --force to deploy anyway."
  exit 0
fi

git reset --hard "@{u}"
git submodule update --init --recursive
AFTER_HASH="$(git rev-parse HEAD)"
info "Updated: ${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}"

git log --oneline "${BEFORE_HASH}..${AFTER_HASH}" | while read -r line; do
  info "  commit: $line"
done

# ------------------------------------------------------------------------------
# Step 3 — Dependency audit
# ------------------------------------------------------------------------------
step "3/8 — Dependency audit"

if [[ "$SKIP_AUDIT" == "true" ]]; then
  warn "Audit skipped via --skip-audit. Proceed with caution."
else
  if git diff --name-only "$BEFORE_HASH" "$AFTER_HASH" | grep -qE '(^|/)(package\.json|pnpm-lock\.yaml)$'; then
    info "Dependency files changed — running pnpm audit..."
    "$PNPM_BIN" audit --audit-level=high || {
      error "High severity vulnerabilities detected. Aborting deploy."
      exit 1
    }
  else
    info "No dependency file changes detected. Skipping audit."
  fi
fi

# ------------------------------------------------------------------------------
# Step 4 — Install dependencies
# ------------------------------------------------------------------------------
step "4/8 — Installing dependencies"
"$PNPM_BIN" install --frozen-lockfile

# ------------------------------------------------------------------------------
# Step 5 — Build
# ------------------------------------------------------------------------------
step "5/8 — Building applications"

if [[ "$DEPLOY_BACKEND" == "true" ]]; then
  ensure_backend_dependency_declared
fi

if [[ "$DEPLOY_BACKEND" == "true" ]] && [[ -d "$BACKEND_DIR/dist" ]]; then
  BACKUP_BACKEND="$(mktemp -d)"
  cp -r "$BACKEND_DIR/dist/." "$BACKUP_BACKEND"
fi

if [[ "$DEPLOY_FRONTEND" == "true" ]] && [[ -d "$FRONTEND_DIR/dist" ]]; then
  BACKUP_WEB="$(mktemp -d)"
  cp -r "$FRONTEND_DIR/dist/." "$BACKUP_WEB"
fi

if [[ "$DEPLOY_BACKEND" == "true" ]]; then
  info "Building shared package @radio/infisical-config..."
  "$PNPM_BIN" --filter "$INFISICAL_PACKAGE" run build

  info "Generating Prisma client..."
  "$PNPM_BIN" --filter "$BACKEND_PACKAGE" run prisma:generate

  info "Building backend..."
  "$PNPM_BIN" --filter "$BACKEND_PACKAGE" run build

  if [[ ! -d "$BACKEND_DIR/dist" ]] || [[ -z "$(ls -A "$BACKEND_DIR/dist")" ]]; then
    error "Backend build produced no artifacts."
    exit 1
  fi

  info "Applying database migrations..."
  "$PNPM_BIN" --filter "$BACKEND_PACKAGE" exec prisma migrate deploy

  BIBLE_DB="$BACKEND_DIR/prisma/dev.db"
  if [[ ! -f "$BIBLE_DB" ]] || [[ ! -s "$BIBLE_DB" ]]; then
    info "Bible database not found or empty — running seed..."
    "$PNPM_BIN" --filter "$BACKEND_PACKAGE" exec ts-node scripts/seed-bible.ts
  else
    info "Bible database already exists. Skipping seed."
  fi
fi

if [[ "$DEPLOY_FRONTEND" == "true" ]]; then
  info "Building frontend..."
  "$PNPM_BIN" --filter "$WEB_PACKAGE" run build

  if [[ ! -d "$FRONTEND_DIR/dist" ]] || [[ -z "$(ls -A "$FRONTEND_DIR/dist")" ]]; then
    error "Frontend build produced no artifacts."
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# Step 6 — Nginx config
# ------------------------------------------------------------------------------
step "6/8 — Updating Nginx configuration"

NGINX_CHANGED=false
if git diff --name-only "$BEFORE_HASH" "$AFTER_HASH" | grep -qE "scripts/(radio\.nginx\.conf|radio-global\.conf)"; then
  NGINX_CHANGED=true
fi

if [[ "$NGINX_CHANGED" == "true" || "$FORCE_DEPLOY" == "true" ]]; then
  cp "$NGINX_CONF" "${NGINX_CONF}.bak"

  [[ -f "$SCRIPTS_DIR/radio-global.conf" ]] && cp "$SCRIPTS_DIR/radio-global.conf" "$NGINX_GLOBAL_CONF"
  cp "$SCRIPTS_DIR/radio.nginx.conf" "$NGINX_CONF"

  nginx -t && systemctl reload nginx && NGINX_RELOADED=true || {
    error "Invalid Nginx configuration. Rolling back."
    cp "${NGINX_CONF}.bak" "$NGINX_CONF"
    exit 1
  }
else
  info "No Nginx changes detected. Skipping."
fi

# ------------------------------------------------------------------------------
# Step 7 — Permissions
# ------------------------------------------------------------------------------
step "7/8 — Applying permissions"
apply_permissions "$DEPLOY_BACKEND" "$DEPLOY_FRONTEND"

# ------------------------------------------------------------------------------
# Step 8 — Restart and health check
# ------------------------------------------------------------------------------
step "8/8 — Restarting backend and running health check"

if [[ "$DEPLOY_BACKEND" == "true" ]]; then
  systemctl restart "$BACKEND_SERVICE"

  info "Waiting for health check..."
  HEALTHY=false

  for i in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null; then
      HEALTHY=true
      info "Health check OK (attempt $i)."
      break
    fi

    info "Attempt $i/$HEALTH_RETRIES — waiting ${HEALTH_INTERVAL}s..."
    sleep "$HEALTH_INTERVAL"
  done

  if [[ "$HEALTHY" == "false" ]]; then
    error "Health check failed after $((HEALTH_RETRIES * HEALTH_INTERVAL)) seconds."
    dump_backend_debug
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
[[ -n "$BACKUP_WEB" ]] && rm -rf "$BACKUP_WEB"

DEPLOY_END="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$DEPLOY_START → $DEPLOY_END] SUCCESS (${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}) [targets: $(target_label)]" >> "$DEPLOY_LOG"

echo
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Deploy completed successfully${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  Targets : $(target_label)"
echo -e "  Commit  : ${BEFORE_HASH:0:8} → ${AFTER_HASH:0:8}"
echo -e "  Nginx   : $(systemctl is-active nginx)"
echo -e "  Backend : $(systemctl is-active "$BACKEND_SERVICE")"
echo -e "  Kokoro  : $(curl -sf --max-time 2 "$KOKORO_HEALTH_URL" >/dev/null && echo "active" || echo "inactive")"
echo -e "  Time    : $DEPLOY_END"
echo -e "  Log     : $DEPLOY_LOG"
echo
#!/usr/bin/env bash
# Pulls the latest code, rebuilds changed apps, and reloads services with zero downtime.
set -euo pipefail

DEPLOY_DIR="/var/www/radio"

cd "$DEPLOY_DIR"

# ─── 1. Pull latest changes ───────────────────────────────────────────────────
echo ">>> Pulling latest changes..."
git pull --ff-only

# ─── 2. Install / update dependencies ────────────────────────────────────────
echo ">>> Installing dependencies..."
npm ci --ignore-scripts

# ─── 3. Rebuild backend ───────────────────────────────────────────────────────
echo ">>> Rebuilding backend..."
npm run build --workspace=backend

# ─── 4. Rebuild web app ───────────────────────────────────────────────────────
echo ">>> Rebuilding web app..."
npm run build --workspace=@radio/web

# ─── 5. Reload backend via systemd (zero-downtime) ────────────────────────────
echo ">>> Reloading backend..."
systemctl reload-or-restart radio-backend

echo ""
echo "Deploy complete at $(date '+%Y-%m-%d %H:%M:%S')."

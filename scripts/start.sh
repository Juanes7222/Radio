#!/usr/bin/env bash
# Starts all Radio services. Safe to call after a reboot or manual stop.
set -euo pipefail

DEPLOY_DIR="/var/www/radio"

echo ">>> Starting radio-backend..."
systemctl start radio-backend

echo ">>> Starting nginx..."
systemctl start nginx

echo ""
systemctl status radio-backend --no-pager
echo ""
echo "Services started."

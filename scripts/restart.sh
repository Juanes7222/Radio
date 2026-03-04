#!/usr/bin/env bash
# Restarts all Radio services (useful after config changes).
set -euo pipefail

echo ">>> Restarting radio-backend..."
systemctl restart radio-backend

echo ">>> Reloading nginx..."
systemctl reload nginx

echo ""
systemctl status radio-backend --no-pager
echo ""
echo "Services restarted."

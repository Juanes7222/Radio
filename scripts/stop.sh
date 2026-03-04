#!/usr/bin/env bash
# Stops all Radio services gracefully.
set -euo pipefail

echo ">>> Stopping radio-backend..."
systemctl stop radio-backend

echo ">>> Stopping nginx..."
systemctl stop nginx

echo ""
echo "Services stopped."

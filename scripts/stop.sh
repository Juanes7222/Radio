#!/usr/bin/env bash
# Stops all Radio services gracefully.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_root

info "Stopping $BACKEND_SERVICE..."
systemctl stop "$BACKEND_SERVICE"

info "Stopping nginx..."
systemctl stop nginx

echo ""
info "Services stopped."
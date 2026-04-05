#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_root

info "Starting $BACKEND_SERVICE..."
systemctl start "$BACKEND_SERVICE"

info "Starting nginx..."
systemctl start nginx

echo ""
systemctl status "$BACKEND_SERVICE" --no-pager
echo ""
info "Services started."
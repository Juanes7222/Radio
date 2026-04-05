#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_root

info "Restarting $BACKEND_SERVICE..."
systemctl restart "$BACKEND_SERVICE"

info "Reloading nginx..."
systemctl reload nginx

echo ""
systemctl status "$BACKEND_SERVICE" --no-pager
echo ""
info "Services restarted."
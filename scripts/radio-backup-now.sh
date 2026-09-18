#!/usr/bin/env bash
# ==============================================================================
# radio-backup-now.sh — Manual backup using Infisical secrets
#
# Same path as the systemd timer: loads secrets from Infisical through
# backend/dist/run-backup.js and then executes scripts/radio-backup.sh.
# Do NOT run radio-backup.sh directly by hand: it skips Infisical and only
# reads /etc/radio/backup.env, so R2 credentials would be missing.
#
# USAGE:
#   sudo bash radio-backup-now.sh
# ==============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"
RUNNER="$BACKEND_DIR/dist/run-backup.js"

command -v node >/dev/null || { echo "node not found in PATH" >&2; exit 1; }
[[ -f "$RUNNER" ]] || { echo "Runner not found: $RUNNER (deploy the backend first)" >&2; exit 1; }

# run-backup.js loads dotenv from the current working directory, so it must
# run from the backend checkout to find the backend .env with the INFISICAL_*
# bootstrap values. Executing it from elsewhere silently skips Infisical.
cd "$BACKEND_DIR"
exec node "$RUNNER"

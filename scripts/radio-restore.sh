#!/usr/bin/env bash
# ==============================================================================
# radio-restore.sh — Restore a backup created by radio-backup.sh
#
# Downloads the bundle (local disk or R2), verifies its sha256 and the SQLite
# integrity, keeps a safety copy of the current state, swaps the database and
# media back in, and restarts the backend with a health check.
#
# USAGE:
#   sudo bash radio-restore.sh [--from auto|local|r2] [--date YYYYMMDD[-HHMMSS]] [--yes]
#
# EXAMPLES:
#   sudo bash radio-restore.sh                        # latest available backup
#   sudo bash radio-restore.sh --from r2              # latest bundle stored in R2
#   sudo bash radio-restore.sh --date 20260911        # latest bundle of that day
# ==============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

ENV_FILE="${BACKUP_ENV_FILE:-/etc/radio/backup.env}"
if [[ -f "$ENV_FILE" ]]; then
  # Same precedence as radio-backup.sh: the environment (Infisical) wins,
  # the file only fills keys missing or empty in the environment.
  _fallback_keys=(
    R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
    R2_ENDPOINT R2_PREFIX
    BACKUP_DIR BACKUP_BACKEND_DIR HEALTH_URL
  )
  declare -A _env_snapshot=()
  for _k in "${_fallback_keys[@]}"; do
    if [[ -n "${!_k:-}" ]]; then
      _env_snapshot["$_k"]="${!_k}"
    fi
  done
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  if ((${#_env_snapshot[@]} > 0)); then
    for _k in "${!_env_snapshot[@]}"; do
      printf -v "$_k" '%s' "${_env_snapshot[$_k]}"
      export "$_k"
    done
  fi
  unset _k _fallback_keys _env_snapshot
fi

BACKEND_DIR="${BACKUP_BACKEND_DIR:-$BACKEND_DIR}"
DB_FILE="$BACKEND_DIR/prisma/dev.db"
RELEASES_DIR="$BACKEND_DIR/data/worker-releases"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/radio}"
R2_PREFIX="${R2_PREFIX:-radio}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"

FROM="auto"
DATE_FILTER=""
ASSUME_YES="false"

usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,2\}//'
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --from=*)     FROM="${arg#*=}" ;;
    --date=*)     DATE_FILTER="${arg#*=}" ;;
    --yes)        ASSUME_YES="true" ;;
    -h|--help)    usage ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

case "$FROM" in
  auto|local|r2) ;;
  *) echo "Invalid --from: $FROM (auto|local|r2)"; exit 1 ;;
esac

require_root
mkdir -p "$BACKUP_DIR"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pick_local() {
  local pattern="radio-"
  [[ -n "$DATE_FILTER" ]] && pattern="radio-${DATE_FILTER//-/}"
  local candidate=""
  for dir in "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"; do
    [[ -d "$dir" ]] || continue
    shopt -s nullglob
    for f in "$dir"/${pattern}*.tar.gz; do
      [[ "$f" -nt "$candidate" || -z "$candidate" ]] && candidate="$f"
    done
    shopt -u nullglob
  done
  echo "$candidate"
}

pick_r2() {
  command -v aws >/dev/null || { echo "aws CLI not found (sudo apt install awscli)" >&2; exit 1; }
  [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" \
    && -n "${R2_SECRET_ACCESS_KEY:-}" && -n "${R2_BUCKET:-}" ]] \
    || { echo "R2 credentials missing (checked environment/Infisical and $ENV_FILE)" >&2; exit 1; }
  R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="auto"
  export AWS_EC2_METADATA_DISABLED="true"
  local pattern="radio-"
  [[ -n "$DATE_FILTER" ]] && pattern="radio-${DATE_FILTER//-/}"
  local latest=""
  for prefix in "${R2_PREFIX}/daily" "${R2_PREFIX}/weekly"; do
    local keys
    keys="$(aws --endpoint-url "$R2_ENDPOINT" --region auto s3 ls \
      "s3://${R2_BUCKET}/${prefix}/" 2>/dev/null \
      | awk -v pat="^${pattern}.*\\.tar\\.gz$" '$4 ~ pat {print $4}' | sort || true)"
    while IFS= read -r key; do
      [[ -n "$key" ]] && latest="$prefix/$key"
    done <<< "$keys"
  done
  echo "$latest"
}

ARCHIVE_PATH=""
if [[ "$FROM" == "local" || "$FROM" == "auto" ]]; then
  ARCHIVE_PATH="$(pick_local)"
fi
if [[ -z "$ARCHIVE_PATH" && "$FROM" != "local" ]]; then
  R2_KEY="$(pick_r2)"
  [[ -n "$R2_KEY" ]] || { echo "No backup found (local or R2)."; exit 1; }
  echo "Downloading s3://${R2_BUCKET}/${R2_KEY} ..."
  aws --endpoint-url "$R2_ENDPOINT" --region auto s3 cp \
    "s3://${R2_BUCKET}/${R2_KEY}" "$WORK/bundle.tar.gz" --only-show-errors
  aws --endpoint-url "$R2_ENDPOINT" --region auto s3 cp \
    "s3://${R2_BUCKET}/${R2_KEY}.sha256" "$WORK/bundle.tar.gz.sha256" --only-show-errors
  ARCHIVE_PATH="$WORK/bundle.tar.gz"
fi
[[ -n "$ARCHIVE_PATH" && -f "$ARCHIVE_PATH" ]] || { echo "No backup found locally."; exit 1; }

echo "Bundle: $ARCHIVE_PATH"
SHA_FILE="$ARCHIVE_PATH.sha256"
if [[ -f "$SHA_FILE" ]]; then
  echo -n "$(cat "$SHA_FILE")  $ARCHIVE_PATH" | sha256sum -c - \
    || { echo "sha256 mismatch — refusing to restore."; exit 1; }
  echo "sha256 OK"
else
  echo "WARN: no .sha256 sidecar for this bundle, skipping hash check"
fi

tar -xzf "$ARCHIVE_PATH" -C "$WORK"
[[ -f "$WORK/dev.db" ]] || { echo "Bundle has no dev.db — refusing to restore."; exit 1; }
[[ "$(sqlite3 "$WORK/dev.db" 'PRAGMA integrity_check;')" == "ok" ]] \
  || { echo "integrity_check failed on the bundle — refusing to restore."; exit 1; }
echo "SQLite integrity OK"
[[ -f "$WORK/manifest.txt" ]] && cat "$WORK/manifest.txt"

if [[ "$ASSUME_YES" != "true" ]]; then
  echo
  echo "This replaces $DB_FILE and merges the bundled media/releases."
  read -r -p "Type RESTORE to continue: " confirm
  [[ "$confirm" == "RESTORE" ]] || { echo "Aborted."; exit 1; }
fi

SAFETY="$BACKUP_DIR/pre-restore-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SAFETY"
[[ -f "$DB_FILE" ]] && cp -a "$DB_FILE" "$SAFETY/dev.db"
[[ -d "$RELEASES_DIR" ]] && cp -a "$RELEASES_DIR" "$SAFETY/worker-releases"
for sub in notice-images notice-videos; do
  for base in "$BACKEND_DIR/storage" "$BACKEND_DIR/backend/storage"; do
    [[ -d "$base/$sub" ]] && cp -a "$base/$sub" "$SAFETY/$sub"
  done
done
chmod -R 600 "$SAFETY"
echo "Safety copy: $SAFETY"

MANAGED_BY_SYSTEMD="false"
if command -v systemctl >/dev/null \
  && systemctl list-unit-files 2>/dev/null | grep -q "^radio-backend"; then
  MANAGED_BY_SYSTEMD="true"
  echo "Stopping radio-backend..."
  systemctl stop "$BACKEND_SERVICE"
fi

# cat > keeps the existing inode, owner and permissions of dev.db.
cat "$WORK/dev.db" > "$DB_FILE"
rm -f "$DB_FILE-shm" "$DB_FILE-wal"

if [[ -d "$WORK/worker-releases" ]]; then
  mkdir -p "$RELEASES_DIR"
  cp -a "$WORK/worker-releases/." "$RELEASES_DIR/"
fi

if [[ -d "$WORK/storage" ]]; then
  for sub in notice-images notice-videos; do
    if [[ -d "$WORK/storage/$sub" ]]; then
      for base in "$BACKEND_DIR/storage" "$BACKEND_DIR/backend/storage"; do
        if [[ -d "$base" || "$base" == "$BACKEND_DIR/storage" ]]; then
          mkdir -p "$base/$sub"
          cp -a "$WORK/storage/$sub/." "$base/$sub/"
          break
        fi
      done
    fi
  done
fi

apply_permissions "true" "false"

if [[ "$MANAGED_BY_SYSTEMD" == "true" ]]; then
  echo "Starting radio-backend..."
  systemctl start "$BACKEND_SERVICE"
  for i in $(seq 1 15); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null; then
      echo "Health check OK (attempt $i)."
      break
    fi
    [[ "$i" == "15" ]] && { echo "Restore applied but health check failed — check journalctl."; exit 1; }
    sleep 5
  done
else
  echo "WARN: radio-backend is not managed by systemd here — start it manually."
fi

echo
echo "Restore complete from $(basename "$ARCHIVE_PATH"). Safety copy: $SAFETY"

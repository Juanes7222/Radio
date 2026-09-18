#!/usr/bin/env bash
# ==============================================================================
# radio-backup.sh — Automatic SQLite + media backup to Cloudflare R2
#
# Takes a crash-consistent snapshot of the backend database with the SQLite
# backup API (safe while the backend is running in WAL mode), bundles it with
# the worker releases and notice media, uploads the bundle to R2, and prunes
# backups older than the retention window, locally and in R2.
#
# USAGE:
#   sudo bash radio-backup.sh
#
# CONFIG:
#   Environment variables. The primary source is Infisical: the systemd timer
#   runs backend/dist/run-backup.js, which loads Infisical into the environment
#   before executing this script, and the backend does the same on boot for
#   manual runs from the superadmin panel. /etc/radio/backup.env below is only
#   a fallback for values missing from the environment.
#   (see scripts/radio-backup.env.example). When R2 credentials are missing
#   the script still completes in local-only mode and prunes old files.
#
# EXIT CODES:
#   0 — backup complete (remote copy included when R2 is configured)
#   1 — failure, see /var/log/radio-backup.log
# ==============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

ENV_FILE="${BACKUP_ENV_FILE:-/etc/radio/backup.env}"
if [[ -f "$ENV_FILE" ]]; then
  # The environment (Infisical via run-backup.js or the backend) is the
  # primary source. This file only fills keys missing or empty in the
  # environment: a plain `source` would overwrite Infisical values with
  # the empty placeholders copied from radio-backup.env.example.
  _fallback_keys=(
    R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
    R2_ENDPOINT R2_PREFIX
    BACKUP_DIR BACKUP_KEEP_DAILY BACKUP_KEEP_WEEKLY BACKUP_UPLOAD_ENABLED
    BACKUP_BACKEND_DIR BACKUP_LOG_FILE
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
LOG_FILE="${BACKUP_LOG_FILE:-/var/log/radio-backup.log}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
R2_PREFIX="${R2_PREFIX:-radio}"
UPLOAD_ENABLED="${BACKUP_UPLOAD_ENABLED:-true}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DOW="$(date +%u)" # 1..7, 7 is Sunday

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  echo "$line" >> "$LOG_FILE" 2>/dev/null || true
}

fail() {
  log "ERROR: $*"
  echo "status=FAILED time=$STAMP error=\"$*\"" > "$BACKUP_DIR/last-backup.status" 2>/dev/null || true
  exit 1
}

require_root
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$(dirname "$LOG_FILE")"
chmod 700 "$BACKUP_DIR"
touch "$LOG_FILE" && chmod 600 "$LOG_FILE"

for bin in sqlite3 tar gzip sha256sum stat df awk; do
  command -v "$bin" >/dev/null || fail "missing required binary: $bin (sudo apt install sqlite3)"
done

[[ -f "$DB_FILE" && -s "$DB_FILE" ]] || fail "database not found or empty: $DB_FILE"

DB_SIZE="$(stat -c%s "$DB_FILE")"
FREE_BYTES="$(df --output=avail -B1 "$BACKUP_DIR" | tail -n 1 | tr -d ' ')"
if (( FREE_BYTES < DB_SIZE * 5 )); then
  fail "not enough disk space in $BACKUP_DIR (free ${FREE_BYTES}B, db ${DB_SIZE}B)"
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/payload"

log "Backup started (db ${DB_SIZE} bytes)"

# Consistent snapshot through the SQLite backup API: this copies both the
# main file and the WAL content, unlike a raw cp of dev.db.
sqlite3 "$DB_FILE" ".backup '$STAGE/payload/dev.db'"
[[ "$(sqlite3 "$STAGE/payload/dev.db" 'PRAGMA integrity_check;')" == "ok" ]] \
  || fail "integrity_check failed on the snapshot"

DB_SHA="$(sha256sum "$STAGE/payload/dev.db" | awk '{print $1}')"

if [[ -d "$RELEASES_DIR" ]]; then
  cp -a "$RELEASES_DIR" "$STAGE/payload/worker-releases"
fi

for sub in notice-images notice-videos; do
  for base in "$BACKEND_DIR/storage" "$BACKEND_DIR/backend/storage"; do
    if [[ -d "$base/$sub" ]]; then
      mkdir -p "$STAGE/payload/storage"
      cp -a "$base/$sub" "$STAGE/payload/storage/$sub"
      break
    fi
  done
done

{
  echo "timestamp=$STAMP"
  echo "host=$(hostname)"
  echo "db_sha256=$DB_SHA"
  echo "db_size=$DB_SIZE"
  echo "git=$(git -C "$DEPLOY_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
} > "$STAGE/payload/manifest.txt"

ARCHIVE="radio-$STAMP.tar.gz"
tar -czf "$BACKUP_DIR/daily/$ARCHIVE" -C "$STAGE/payload" .
sha256sum "$BACKUP_DIR/daily/$ARCHIVE" | awk '{print $1}' > "$BACKUP_DIR/daily/$ARCHIVE.sha256"
chmod 600 "$BACKUP_DIR/daily/$ARCHIVE" "$BACKUP_DIR/daily/$ARCHIVE.sha256"

IS_WEEKLY="false"
if [[ "$DOW" == "7" ]]; then
  cp "$BACKUP_DIR/daily/$ARCHIVE" "$BACKUP_DIR/weekly/$ARCHIVE"
  cp "$BACKUP_DIR/daily/$ARCHIVE.sha256" "$BACKUP_DIR/weekly/$ARCHIVE.sha256"
  IS_WEEKLY="true"
fi

ARCHIVE_SIZE="$(stat -c%s "$BACKUP_DIR/daily/$ARCHIVE")"
log "Bundle ready: daily/$ARCHIVE (${ARCHIVE_SIZE} bytes, weekly=$IS_WEEKLY)"

r2_configured() {
  [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" \
    && -n "${R2_SECRET_ACCESS_KEY:-}" && -n "${R2_BUCKET:-}" ]]
}

# Deletes remote bundles beyond retention. Names sort chronologically
# (radio-YYYYMMDD-HHMMSS.tar.gz), so the oldest come first.
prune_r2_prefix() {
  local prefix="$1" keep="$2"
  local keys
  keys="$(aws "${AWS_ENDPOINT_ARGS[@]}" s3 ls "s3://${R2_BUCKET}/${prefix}/" 2>/dev/null \
    | awk '$4 ~ /^radio-.*\.tar\.gz$/ {print $4}' | sort || true)"
  [[ -z "$keys" ]] && return 0
  local -a arr=()
  while IFS= read -r line; do [[ -n "$line" ]] && arr+=("$line"); done <<< "$keys"
  local total="${#arr[@]}"
  if (( total > keep )); then
    local drop=$((total - keep))
    for ((i = 0; i < drop; i++)); do
      aws "${AWS_ENDPOINT_ARGS[@]}" s3 rm "s3://${R2_BUCKET}/${prefix}/${arr[$i]}" >/dev/null
      aws "${AWS_ENDPOINT_ARGS[@]}" s3 rm "s3://${R2_BUCKET}/${prefix}/${arr[$i]}.sha256" >/dev/null || true
      log "Pruned remote backup: $prefix/${arr[$i]}"
    done
  fi
}

if [[ "$UPLOAD_ENABLED" == "true" ]]; then
  if r2_configured; then
    command -v aws >/dev/null || fail "aws CLI not found (install AWS CLI v2 from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)"
    R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
    # Must be an array, not a string: the script sets IFS=$'\n\t' (no spaces),
    # so unquoted string expansion would pass the whole value as ONE argument.
    # Region comes from the exported AWS_DEFAULT_REGION below.
    AWS_ENDPOINT_ARGS=(--endpoint-url "$R2_ENDPOINT")
    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    export AWS_DEFAULT_REGION="auto"
    export AWS_EC2_METADATA_DISABLED="true"

    aws "${AWS_ENDPOINT_ARGS[@]}" s3 cp "$BACKUP_DIR/daily/$ARCHIVE" \
      "s3://${R2_BUCKET}/${R2_PREFIX}/daily/$ARCHIVE" --only-show-errors \
      || fail "R2 upload failed: daily/$ARCHIVE"
    aws "${AWS_ENDPOINT_ARGS[@]}" s3 cp "$BACKUP_DIR/daily/$ARCHIVE.sha256" \
      "s3://${R2_BUCKET}/${R2_PREFIX}/daily/$ARCHIVE.sha256" --only-show-errors \
      || fail "R2 upload failed: daily/$ARCHIVE.sha256"

    if [[ "$IS_WEEKLY" == "true" ]]; then
      aws "${AWS_ENDPOINT_ARGS[@]}" s3 cp "$BACKUP_DIR/weekly/$ARCHIVE" \
        "s3://${R2_BUCKET}/${R2_PREFIX}/weekly/$ARCHIVE" --only-show-errors \
        || fail "R2 upload failed: weekly/$ARCHIVE"
      aws "${AWS_ENDPOINT_ARGS[@]}" s3 cp "$BACKUP_DIR/weekly/$ARCHIVE.sha256" \
        "s3://${R2_BUCKET}/${R2_PREFIX}/weekly/$ARCHIVE.sha256" --only-show-errors \
        || fail "R2 upload failed: weekly/$ARCHIVE.sha256"
    fi

    # Verify the remote object size matches before pruning anything.
    REMOTE_SIZE="$(aws "${AWS_ENDPOINT_ARGS[@]}" s3api head-object \
      --bucket "$R2_BUCKET" --key "${R2_PREFIX}/daily/$ARCHIVE" \
      --query ContentLength --output text 2>/dev/null || echo "")"
    [[ "$REMOTE_SIZE" == "$ARCHIVE_SIZE" ]] \
      || fail "R2 size mismatch for daily/$ARCHIVE (local $ARCHIVE_SIZE, remote ${REMOTE_SIZE:-unknown})"

    log "R2 upload verified: s3://${R2_BUCKET}/${R2_PREFIX}/daily/$ARCHIVE"
    prune_r2_prefix "${R2_PREFIX}/daily" "$KEEP_DAILY"
    prune_r2_prefix "${R2_PREFIX}/weekly" "$KEEP_WEEKLY"
  else
    log "WARN: R2 credentials missing (checked environment/Infisical and $ENV_FILE) — local-only backup, no upload"
  fi
else
  log "WARN: upload disabled (BACKUP_UPLOAD_ENABLED=false) — local-only backup"
fi

# Local retention: keep the newest bundles, delete the rest with sidecars.
prune_local_dir() {
  local dir="$1" keep="$2"
  shopt -s nullglob
  local -a files=()
  while IFS= read -r line; do files+=("$line"); done < <(printf '%s\n' "$dir"/radio-*.tar.gz | sort)
  shopt -u nullglob
  local total="${#files[@]}"
  (( total == 0 )) && return 0
  if (( total > keep )); then
    local drop=$((total - keep))
    for ((i = 0; i < drop; i++)); do
      rm -f "${files[$i]}" "${files[$i]}.sha256"
      log "Pruned local backup: $(basename "${files[$i]}")"
    done
  fi
}

prune_local_dir "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune_local_dir "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

echo "status=OK time=$STAMP archive=daily/$ARCHIVE bytes=$ARCHIVE_SIZE weekly=$IS_WEEKLY" \
  > "$BACKUP_DIR/last-backup.status"
chmod 600 "$BACKUP_DIR/last-backup.status"

log "Backup complete: daily/$ARCHIVE"

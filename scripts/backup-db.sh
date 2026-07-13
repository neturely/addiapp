#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — nightly backup of the addiapp_prod MySQL database.
#
# Runs on the KnownHost box from cron (see docs/DEPLOY.md § Backups). Writes a
# consistent, gzipped, timestamped dump to ~/backups/db/ with a .sha256 sidecar,
# then prunes dumps older than RETENTION_DAYS. ~/backups/db/ is the handoff point
# for the external offsite pull (a separate NAS-based job, tracked elsewhere).
#
# This is the app-level DB backup — independent of KnownHost's JetBackup, which
# does not expose database restore points on this account (see DEPLOY.md).
#
# Credentials come from ~/backups/.my.cnf (chmod 600) — a dedicated READ-ONLY
# MySQL user (addiapp_bak) — and are passed via --defaults-extra-file, never on
# the command line (which would be visible in `ps`).
#
# Install + verification: docs/DEPLOY.md § Backups. Not shipped by the deploy
# rsync (which only syncs client/dist + api/); copy it to the box once.
# =============================================================================
set -euo pipefail

# --- config ------------------------------------------------------------------
DB_NAME="addiapp_prod"
BACKUP_DIR="${HOME}/backups/db"
DEFAULTS_FILE="${HOME}/backups/.my.cnf"
RETENTION_DAYS=14

# cron runs with a minimal PATH; make sure the tools resolve on cPanel/CloudLinux.
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

# --- dump --------------------------------------------------------------------
stamp="$(date +%F)" # YYYY-MM-DD, server-local time
base="${DB_NAME}-${stamp}.sql.gz"
final="${BACKUP_DIR}/${base}"
tmp="${final}.tmp"

mkdir -p "${BACKUP_DIR}"

# --single-transaction --quick : consistent InnoDB snapshot with NO table locks,
#                                so the nightly dump never blocks the live app.
# --no-tablespaces             : cPanel DB users lack the PROCESS privilege that
#                                MySQL 8 tablespace introspection needs; without
#                                this the dump errors out.
# --set-gtid-purged=OFF        : keeps the dump restorable into a fresh DB
#                                without requiring the SUPER privilege.
mysqldump \
  --defaults-extra-file="${DEFAULTS_FILE}" \
  --single-transaction \
  --quick \
  --no-tablespaces \
  --set-gtid-purged=OFF \
  "${DB_NAME}" \
  | gzip -c > "${tmp}"

# Atomic publish: the offsite pull reads this directory, so the final filename
# must only ever appear once the file is complete. mv on the same fs is atomic.
mv "${tmp}" "${final}"

# Integrity sidecar for the offsite pull (and our own verification) to check.
( cd "${BACKUP_DIR}" && sha256sum "${base}" > "${base}.sha256" )

# Self-check: fail loudly (cron MAILTO surfaces stderr) if the gzip is corrupt.
gzip -t "${final}"

# --- rotation ----------------------------------------------------------------
# Keep ~RETENTION_DAYS daily dumps (and their .sha256 sidecars); prune older.
find "${BACKUP_DIR}" -type f -name "${DB_NAME}-*.sql.gz*" -mtime "+${RETENTION_DAYS}" -delete

echo "[addiapp-backup] $(date '+%F %T') wrote ${final} ($(du -h "${final}" | cut -f1))"

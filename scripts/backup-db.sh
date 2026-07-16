#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — MySQL/MariaDB backup of the addiapp_prod database.
#
# Two modes:
#   (no args)      nightly backup  → ~/backups/db/addiapp_prod-<YYYY-MM-DD>.sql.gz
#                  from cron (see docs/DEPLOY.md § Backups). Age-based rotation
#                  (keep RETENTION_DAYS days).
#   --pre-deploy   deploy safety net → ~/backups/pre-deploy/pre-deploy-<ts>.sql.gz
#                  run by the deploy pipeline (OPS-2, #103) BEFORE migrations, so
#                  there's always a restore point. Count-based rotation (keep
#                  newest KEEP), separate dir so it never collides with the
#                  nightly rotation glob. The deploy step gates the migration on
#                  this dump succeeding.
#
# Both modes share the dump mechanism: --single-transaction --quick (consistent
# InnoDB snapshot, no table locks), gzip, a .sha256 sidecar, atomic publish via
# mv, and a gzip -t self-check. Credentials come from ~/backups/.my.cnf (chmod
# 600) — a dedicated READ-ONLY MySQL user (addiapp_bak) — passed via
# --defaults-extra-file, never on the command line (visible in `ps`).
#
# This script IS shipped by the deploy rsync (into ~/bin) as of #103, so the box
# copy stays current — the pre-deploy backup is deploy-critical. Restore is one
# line:  zcat ~/backups/pre-deploy/pre-deploy-<ts>.sql.gz | mysql addiapp_prod
#
# ADDIAPP_DB_NAME / ADDIAPP_DB_DEFAULTS override the DB name / creds file (for
# local testing against a dev DB); production sets neither and gets the defaults.
# =============================================================================
set -euo pipefail

# --- mode --------------------------------------------------------------------
MODE="nightly"
case "${1:-}" in
  "") ;;
  --pre-deploy) MODE="pre-deploy" ;;
  *) echo "usage: $0 [--pre-deploy]" >&2; exit 2 ;;
esac

# --- config ------------------------------------------------------------------
DB_NAME="${ADDIAPP_DB_NAME:-addiapp_prod}"
DEFAULTS_FILE="${ADDIAPP_DB_DEFAULTS:-${HOME}/backups/.my.cnf}"

if [[ "${MODE}" == "pre-deploy" ]]; then
  BACKUP_DIR="${HOME}/backups/pre-deploy"
  stamp="$(date +%Y-%m-%dT%H%M%S)"   # second-resolution — deploys can be seconds apart
  base="pre-deploy-${stamp}.sql.gz"
  KEEP=5                             # keep newest N deploy backups (count-based)
else
  BACKUP_DIR="${HOME}/backups/db"
  stamp="$(date +%F)"                # YYYY-MM-DD, server-local time
  base="${DB_NAME}-${stamp}.sql.gz"
  RETENTION_DAYS=14
fi

# cron runs with a minimal PATH; make sure the tools resolve on cPanel/CloudLinux.
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

final="${BACKUP_DIR}/${base}"
tmp="${final}.tmp"
mkdir -p "${BACKUP_DIR}"

# --- dump (shared) -----------------------------------------------------------
# MariaDB 10.11 on prod. --single-transaction --quick = consistent InnoDB
# snapshot with NO table locks, so the dump never blocks the live app.
# Deliberately NOT --set-gtid-purged / --no-tablespaces (MySQL-only; MariaDB
# rejects/doesn't need them).
mysqldump \
  --defaults-extra-file="${DEFAULTS_FILE}" \
  --single-transaction \
  --quick \
  "${DB_NAME}" \
  | gzip -c > "${tmp}"

# Atomic publish: the offsite pull reads this directory, so the final filename
# must only ever appear once the file is complete. mv on the same fs is atomic.
mv "${tmp}" "${final}"

# Integrity sidecar for the offsite pull (and our own verification) to check.
( cd "${BACKUP_DIR}" && sha256sum "${base}" > "${base}.sha256" )

# Self-check: fail loudly (cron MAILTO / deploy step surfaces stderr) on corruption.
gzip -t "${final}"

# --- rotation (mode-specific) ------------------------------------------------
if [[ "${MODE}" == "pre-deploy" ]]; then
  # Deploys are irregular, so count-based (keep newest KEEP) — age-based could
  # wipe every deploy backup in a quiet month, or pile up in a busy day. Prune
  # each stale .gz together with its .sha256 sidecar.
  { ls -1t "${BACKUP_DIR}"/pre-deploy-*.sql.gz 2>/dev/null || true; } \
    | tail -n "+$((KEEP + 1))" \
    | while read -r f; do rm -f "${f}" "${f}.sha256"; done
else
  # Keep ~RETENTION_DAYS daily dumps (and their .sha256 sidecars); prune older.
  find "${BACKUP_DIR}" -type f -name "${DB_NAME}-*.sql.gz*" -mtime "+${RETENTION_DAYS}" -delete
fi

echo "[addiapp-backup] $(date '+%F %T') [${MODE}] wrote ${final} ($(du -h "${final}" | cut -f1))"

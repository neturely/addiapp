#!/bin/bash
# =============================================================================
# db.sh — manage the local MySQL dev container (Docker Compose).
#
# macOS (Homebrew + colima) uses the standalone `docker-compose`; Linux/WSL uses
# the `docker compose` plugin. Mirrors the wptips.com startup.sh convention so
# the same `npm run db:*` commands work on both.
#
# Usage: bash scripts/db.sh [up|down|reset]
#   up     start MySQL and wait until it reports healthy (default)
#   down   stop MySQL (data persists in the db_data volume)
#   reset  destroy the volume and recreate MySQL from scratch
# =============================================================================
set -e

cd "$(dirname "$0")/.."

# macOS Homebrew/colima → docker-compose (hyphen); Linux/WSL → docker compose
if [ "$(uname -s)" = "Darwin" ]; then
  COMPOSE="docker-compose"
else
  COMPOSE="docker compose"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: the 'docker' CLI is not on your PATH." >&2
  echo "colima users — link it once, then start colima:" >&2
  echo "  ln -sf \"\$(brew --prefix docker)/bin/docker\" /opt/homebrew/bin/docker" >&2
  echo "  colima start" >&2
  exit 1
fi

wait_for_health() {
  local cid
  cid="$($COMPOSE ps -q mysql)"
  if [ -z "$cid" ]; then
    echo "MySQL container not found." >&2
    exit 1
  fi
  printf 'Waiting for MySQL to be healthy'
  for _ in $(seq 1 30); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; then
      echo ' ready.'
      return 0
    fi
    printf '.'
    sleep 2
  done
  echo ' timed out waiting for MySQL.' >&2
  exit 1
}

case "${1:-up}" in
up)
  $COMPOSE up -d
  wait_for_health
  echo "MySQL is up on localhost:3306. Run 'npm run db:migrate' to apply migrations."
  ;;
down)
  $COMPOSE down
  ;;
reset)
  $COMPOSE down -v
  $COMPOSE up -d
  wait_for_health
  echo "MySQL reset. Run 'npm run db:migrate' to re-apply migrations."
  ;;
*)
  echo "usage: bash scripts/db.sh [up|down|reset]" >&2
  exit 1
  ;;
esac

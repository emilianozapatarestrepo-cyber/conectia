#!/usr/bin/env sh
# Shell wrapper — used in bare environments without Node/tsx.
# Tracks applied versions in schema_migrations to avoid re-running.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[migrate] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

echo "[migrate] Ensuring schema_migrations table…"
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )
" > /dev/null

MIGRATIONS_DIR="${MIGRATIONS_DIR:-$(dirname "$0")/../migrations}"

for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  version=$(basename "$f" .sql)

  already=$(psql "$DATABASE_URL" -tAc \
    "SELECT 1 FROM schema_migrations WHERE version = '$version'")

  if [ "$already" = "1" ]; then
    echo "[migrate] SKIP  $version (already applied)"
    continue
  fi

  echo "[migrate] APPLY $version…"
  psql "$DATABASE_URL" -f "$f"
  psql "$DATABASE_URL" -c \
    "INSERT INTO schema_migrations (version) VALUES ('$version')" > /dev/null
  echo "[migrate] OK    $version"
done

echo "[migrate] Done."

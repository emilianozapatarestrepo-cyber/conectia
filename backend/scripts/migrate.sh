#!/usr/bin/env sh
set -e

echo "Running database migrations..."

for f in /app/migrations/*.sql; do
  echo "  → $(basename "$f")"
  psql "$DATABASE_URL" -f "$f"
done

echo "Migrations complete."

#!/bin/sh
# Applies all migrations to a scratch Postgres database and runs every SQL test in order.
# Usage (as a Postgres superuser):  sh supabase/tests/run_all.sh <database-name>
set -e
DB=${1:-t}; HERE=$(cd "$(dirname "$0")" && pwd); M="$HERE/../migrations"
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/stub_supabase_schemas.sql"
for f in "$M"/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
for f in lifecycle_and_security rules_overrides rules_frozen_when_published rooms_lifecycle game_engine content_import_security; do
  echo "##### $f"
  if ! output=$(psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/$f.sql" 2>&1); then
    printf '%s\n' "$output" | grep -v '^$' | sed 's/^psql:[^ ]*:[0-9]*: //'
    echo "SQL suite $f failed with a database error." >&2
    exit 1
  fi
  printf '%s\n' "$output" | grep -v '^$' | sed 's/^psql:[^ ]*:[0-9]*: //'
  case "$output" in
    *'FAIL '*) echo "SQL suite $f reported a failed assertion." >&2; exit 1 ;;
  esac
done

#!/bin/sh
# Applies all migrations to a scratch Postgres database and runs every SQL test in order.
# Usage (as a Postgres superuser):  sh supabase/tests/run_all.sh <database-name>
set -e
DB=${1:-t}; HERE=$(cd "$(dirname "$0")" && pwd); M="$HERE/../migrations"
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/stub_supabase_schemas.sql"
for f in "$M"/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
for f in lifecycle_and_security rules_overrides rules_frozen_when_published rooms_lifecycle game_engine; do
  echo "##### $f"; psql -q -d "$DB" -f "$HERE/$f.sql" 2>&1 | grep -v '^$' | sed 's/^psql:[^ ]*:[0-9]*: //'
done

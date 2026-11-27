#!/bin/sh
# Detective content tests on a database prepared by run_all.sh (same name):
# seeds the published case packs and the hybrid v2 fixture, then plays them end to end.
#   sh supabase/tests/run_all.sh t && sh supabase/tests/run_detective.sh t
set -e
DB=${1:-t}; HERE=$(cd "$(dirname "$0")" && pwd)
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2'),('00000000-0000-0000-0000-0000000000d3') on conflict do nothing;
insert into user_roles(user_id, role) values ('00000000-0000-0000-0000-0000000000a1','SUPER_ADMIN') on conflict do nothing;
SQL
for s in blue_ring_heist clock_that_stopped missing_180 blue_moonflower_seed; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/../seed/detective_$s.sql"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/fixtures/hybrid_mini.sql"
for f in detective_case_packs detective_hybrid; do
  echo "##### $f"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/$f.sql" 2>&1 | sed 's/^psql:[^ ]* //'
done

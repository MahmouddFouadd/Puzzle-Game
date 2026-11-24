# Migration Test Results

**Audit date:** 2026-11-25

| Test | Command/environment | Result | Integration status |
|---|---|---|---|
| Frontend unit tests | `npm test` in sandbox, Node/Vitest | 8 files, 74 tests passed (includes 5 streamed-request limit tests) | Unit tests only; no DB integration |
| TypeScript + production frontend build | `npm run build` in sandbox | Passed (`tsc --noEmit`, `vite build`); Vite emitted large-chunk warning | Build only |
| SQL test runner shell syntax | `sh -n supabase/tests/run_all.sh` | Passed | Shell validation only; database execution is documented in the next row |
| SQL migrations and database suites | `PGDATABASE=postgres sh supabase/tests/run_all.sh puzzle_game_local_scratch_20261125` on sandbox-local PostgreSQL 16 | Passed (exit 0), including new `content_import_security.sql` assertions | Isolated local database with synthetic fixtures only; not production/staging |
| Live Supabase schema/catalog | Supabase MCP read-only catalog inspection (`zrbvgtqspekxrnnzegwh`) | `ACTIVE_HEALTHY`; 32 public tables catalogued with RLS enabled; expected 0009 functions and 0010 columns exist; 0011 Content Studio tables/functions absent | Catalog only; migration history unavailable/empty; no migration applied |
| Live Storage catalog | Supabase MCP | `story-originals` and `story-pieces` buckets both private | Bucket visibility verified; object-level policy behavior not tested |
| RLS/Realtime integration | Live project | Not run | Policy semantics, user-role isolation and Realtime behavior not tested |

## Important safety note

`supabase/tests/run_all.sh` drops and recreates its named database. It was run only against a verified sandbox-local scratch database, which was dropped after the successful run. No live Supabase schema or data was changed. Supabase MCP reported no migration ledger entries and no `supabase_migrations.schema_migrations` table; catalog objects show earlier schema work is present, so migration chronology cannot be inferred from that empty history. The existing `docs/PROJECT_AUDIT.md` describes historical SQL testing; this audit independently reproduced the suite locally, not against production.

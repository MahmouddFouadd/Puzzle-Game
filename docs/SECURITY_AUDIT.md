# Security Audit

**Date:** 2026-11-25. Static repository review, local unit/build/dependency checks, PostgreSQL 16 scratch-database tests, and read-only Supabase/Cloudflare inspection. No live database, Storage, Realtime, or Cloudflare configuration was changed.

## Findings and disposition

| Severity | Finding | Evidence | Status / action |
|---|---|---|---|
| Medium | AI Edge Function could buffer an unknown-length request without an incremental cap | `supabase/functions/content-studio-generate/index.ts` previously used `request.text()` before checking body size | **Fixed on this working branch:** `request-limits.ts` enforces an 8 KiB streamed byte cap; malformed `Content-Length` is rejected. Added Vitest unit cases. |
| Medium (pre-deployment) | Import batch state and error counters were directly mutable by the owner client | `0011_content_studio.sql`; `src/content/api.ts`; `src/pages/admin/ContentImport.tsx` | **Fixed locally, not live:** 0011 now denies direct state/counter updates, starts batches in `VALIDATING`, derives error counts from persisted error rows, and exposes owner/permission-checked RPC transitions. The client calls that RPC. Added SQL regression tests and ran them in scratch PostgreSQL 16. The live catalog lacks 0011; any other environment where it was applied must receive a forward migration rather than an edit to its history. |
| Moderate/High/Critical (dependency advisories) | `npm audit --omit=dev` reports 1 critical, 1 high, 7 moderate vulnerable dependency records | Audit on installed lockfile; critical chain includes `tar` used transitively by `@capacitor/cli`; moderate includes React Router, ExcelJS/uuid and transitive packages | **Unfixed.** Suggested fixes are major-version changes (e.g., Capacitor CLI and React Router); do not apply blindly. Audit direct/transitive reachability, select compatible patched versions, preserve Capacitor 6 native compatibility, then test Android and importer. Treat as a release blocker until triaged/fixed or formally risk-accepted. |
| Moderate (verification gap) | RLS policy semantics, object access and Realtime isolation have not been tested | Supabase MCP catalog: RLS enabled on all 32 returned public tables; `story-originals` and `story-pieces` buckets are private | **Partially verified.** Table RLS enablement and bucket privacy are confirmed; actual row/object access and role isolation remain untested. Use a staging/disposable target before functional security testing. |
| Low (deployment hardening) | No CSP/security headers configuration found | No Pages `_headers` file; only SPA `_redirects` exists | **Open.** Design CSP with Supabase HTTPS/WSS origins and app needs, validate in preview before production. |
| Low (documentation) | Migration lists in README and database design omitted 0009–0011 | `README.md`, `docs/DATABASE_DESIGN.md`, `supabase/migrations/` | **Updated locally:** docs now include the full migration inventory and warn against replaying migrations on existing production databases without history reconciliation. |
| Medium (test reliability) | SQL runner fixtures included an invalid attempt count, expected published-story errors were uncaught, and scratch stubs lacked `service_role` | `supabase/tests/run_all.sh`, `rules_overrides.sql`, `rules_frozen_when_published.sql`, `stub_supabase_schemas.sql` | **Fixed locally:** fixtures/assertions and stubs updated; all SQL migration/test suites passed on local PostgreSQL 16. |

## Positive controls observed

- Frontend uses the Supabase anon key only; the Edge Function gets the service-role key from server environment.
- Content import parser contains archive/path and size bounds (reviewed statically).
- Import-batch status/counters now use an owner/permission-checked RPC; SQL regressions verified direct-update blocking and server-derived terminal status/error counts.
- Migration 0011 contains Content Studio RLS/policy definitions but its tables/functions are absent from the live project; no Content Studio policy is active there based on catalog inspection.
- Existing gameplay tables have RLS enabled, but authenticated-user behavior and gameplay function grants were not tested.

## Tests

`npm test` passed 74 tests across 8 files after the request-size and import API changes. `npm run build` passed (with Vite large-chunk warnings). The full SQL migration/test harness passed on sandbox-local PostgreSQL 16, including `content_import_security.sql`. `sh -n supabase/tests/run_all.sh` and `git diff --check` passed. `npm audit --omit=dev` returned 9 findings (1 critical, 1 high, 7 moderate); this count represents audited dependency records, not 9 confirmed exploitable application paths.

## Secrets and access

No service-role key or AI key was found in tracked frontend source. The publishable key did not provide direct REST access to database records; Supabase MCP was used for read-only catalog inspection. In the user-selected Cloudflare account, Pages `puzzle-game` has no Git source/build command/runtime variables configured and latest deployment metadata is ad-hoc/dirty with a commit hash not found in the GitHub repository. The public bundle did not contain the expected Content Studio code markers. Inspection was read-only; no Cloudflare setting or deployment was changed.

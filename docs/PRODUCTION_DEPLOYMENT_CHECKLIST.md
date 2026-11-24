# Production Deployment Checklist — NOT APPROVED / NOT EXECUTED

## Current decision: NO-GO

This audit performed no production deployment and applied no database migration. A successful web build is not release approval.

## Blockers before staging/production

- [x] User selected Cloudflare account `mafsm1133@gmail.com` (`fb1570173b498e57f13159815f35340d`); the account-specific Pages project was inspected read-only.
- [ ] Reconcile Pages project `puzzle-game`: production branch says `main`, but API reports no Git source/build command/root/output directory or environment variables; latest production upload was ad hoc, marked dirty, and its commit hash could not be resolved in the GitHub repository. Current Pages artifact does not contain Content Studio markers. No custom domain is configured (only `.pages.dev`).
- [x] A manual-only preview workflow is prepared locally at `.github/workflows/cloudflare-pages-preview.yml`. It is restricted to `feature/content-studio`, requires an explicit “PREVIEW ONLY” selection, and targets a non-production Pages branch; it has not been pushed or run.
- [ ] Configure a reproducible deployment process, set GitHub Actions secrets (`VITE_SUPABASE_URL`, public `VITE_SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN`) and validate the preview workflow, SPA fallback, and deployed commit before any release. No Cloudflare configuration was changed.
- [ ] Verify configured build variables are only `VITE_SUPABASE_URL` and the public anon key. Never expose service-role or AI provider keys to Vite/frontend.
- [x] Supabase project identity and read-only catalog: `zrbvgtqspekxrnnzegwh` is `ACTIVE_HEALTHY`; all 32 returned public tables have RLS enabled; two Storage buckets are private; 0009/0010 objects exist and 0011 Content Studio objects are absent.
- [ ] Resolve missing/unavailable migration history and obtain an isolated database for migration/integration tests; inspect RLS policy behavior and auth settings before enabling Content Studio. Do not apply 0011 to production without exact explicit approval.
- [x] Locally harden the currently unapplied 0011 import-batch status control; the full migration/test harness passed on sandbox-local PostgreSQL 16. This is not live/staging approval.
- [ ] Reconcile migration history for every target environment and obtain explicit approval before applying any migration to production; use a forward migration anywhere 0011 was already applied.
- [ ] Triage and fix or formally accept npm audit results (1 critical, 1 high, 7 moderate records); rerun unit/build/Android tests on proposed compatible dependency updates.
- [ ] Deploy/verify Edge Function with the streamed request-size limit and server-side provider secrets; test auth, invalid/malformed input, chunked oversized requests, provider timeout/errors, capacity and rate limits.
- [ ] Configure and test CSP/security headers in preview, including required Supabase HTTPS/WSS origins.
- [ ] Run SQL suites in an isolated scratch DB and staging; note the runner drops its target DB. Test live RLS, Storage, Realtime isolation, and import/review workflows.
- [ ] Execute browser E2E and real multiplayer reconnect/device tests; build and inspect Android APK artifact.
- [ ] Confirm backup/restore procedure and monitoring/rollback owner.

## Approval gates

- Production deploy requires a separate explicit user approval of the exact target/account/commit. The currently inspected Pages target is not reproducibly tied to GitHub `main`.
- Production database migrations require separate explicit user approval of the migration and target project.
- Do not deploy merely because the feature branch is already merged into `main`.

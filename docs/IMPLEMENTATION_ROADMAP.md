# Implementation roadmap

| Milestone | State | Remaining |
|---|---|---|
| 1 Audit & hardening | mostly done | live Realtime isolation test; CSP/headers |
| 2 Story builder | partly done | story duplication, full-experience preview, server-side processing job (D12), question categories |
| 3 Rooms & teams | done (TESTED DB, UI untested in browser) | room-override UI |
| 4 Game engine | done (TESTED DB; screen untested in browser) | live multi-phone test, recovery codes for lost sessions |
| 5 Results & final reveal | not started | final story map/reveal, reports (views), PDF + Excel export, date/story/room filters |
| 6 Production | not started | PWA, Cloudflare Pages config + `_headers`, stress/realtime tests, deployment + backup docs, admin bootstrap guide |


## 2026-11-24 audit addendum

- The content-studio PR #1 is already merged. `main` is a merge commit ahead of `feature/content-studio`, with identical tree contents (0 differing files); do not perform another merge.
- Local working branch remains `feature/content-studio`, baseline `74b5cf8`. Audit changes are local and uncommitted.
- P0: dependency triage (`npm audit --omit=dev`: 1 critical, 1 high, 7 moderate records; proposed upgrades include major-version changes).
- P0: confirm Supabase project and migration history; current configured credentials returned 401 and local psql/Supabase CLI are unavailable.
- P0: narrow import batch status/count mutation through a forward migration after migration-history verification.
- P1: request body buffering risk in AI Edge Function was fixed locally with streaming 8 KiB cap and unit tests.
- P1: verify Cloudflare Pages settings after the user selects among three accounts; no account-specific changes made.
- P1: run DB/RLS/Storage/Realtime integration tests and browser/multiplayer E2E in staging.
- P2: improve image library pagination, close SQL test-runner failure-reporting gap, add frontend component/E2E coverage, complete actual image generation pipeline, and build/test Android APK.

See `SECURITY_AUDIT.md`, `CONTENT_STUDIO_FINAL_AUDIT.md`, `MIGRATION_PREFLIGHT.md`, `MIGRATION_TEST_RESULTS.md`, and `PRODUCTION_DEPLOYMENT_CHECKLIST.md` for detail. No production deployment or migration was performed.
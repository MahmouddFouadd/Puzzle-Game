# Project status

Scale: NOT STARTED · IN PROGRESS · IMPLEMENTED (code exists, not exercised) · TESTED (automated test evidence) · VERIFIED (tested against real Supabase + real devices) · BLOCKED.

**Scope note:** Detective migrations, server-side answer validation, publish validation, production build, and local HTTP route availability have been verified. Authenticated browser gameplay, live Realtime multiplayer, and a physical Android device still require dedicated credentials/devices and are not claimed here.

## Evidence (last run)

| Check | Result |
|---|---|
| `npm run typecheck` | pass — 2026-11-26 |
| `npm test -- --run` | pass — 11 files, 96 tests |
| `npm run build` | pass — Vite production build |
| `npm run check:routes` local | pass — 30 manifest routes, HTTP 200 |
| Supabase Detective migrations | applied to `Puzzle-Game` (`zrbvgtqspekxrnnzegwh`), including runtime and publish validator |
| Supabase Detective functions | verified: session start, safe payload, answer submission, case validation, publishing |
| GitHub commit | `88f93113364de76482f57b857a0684da3a1aec35` pushed to `main` |
| Cloudflare production workflow | success — run `45712724855` |
| Android Debug Admin/User workflow | success — run `45712724685` |
| Production route/assets check | pass — 30 routes and both Detective SVG assets returned HTTP 200 |

## Detective Mode

| Area | Status | Notes |
|---|---|---|
| Player catalog and Solo session routes | TESTED (build/routes) | `/detective` and `/detective/session/:sessionId`; runtime requires Auth and a published case |
| Safe session payload and server-authoritative answers | TESTED (Supabase schema/function verification) | answer keys are not returned to players; idempotency and scoring are server-side |
| Detective Studio and case editor | IMPLEMENTED | case creation, scene creation, evidence display, and draft workflow are present |
| Publish gate | TESTED (Supabase function verification) | incomplete cases are rejected by `publish_detective_case` |
| Evidence/question authoring UI | IN PROGRESS | existing editor displays evidence; full hotspot/question authoring panel remains a follow-up |
| Demo content | STAGING-ONLY | `supabase/seed/detective_demo_case.sql` is not applied to production |

## Existing features

Auth, roles, permissions, stories, rooms, teams, scoring, reports, admin pages, and existing routes remain in the project. No existing migrations were modified; Detective work is additive in migrations `0012`–`0014`.

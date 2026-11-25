# Project status

Scale: NOT STARTED · IN PROGRESS · IMPLEMENTED (code exists, not exercised) · TESTED (automated test evidence) · VERIFIED (tested against real Supabase + real devices) · BLOCKED.
**Scope note:** HTTP route availability and the Detective migration have been verified against the real deployment/Supabase project. Authenticated browser gameplay, live Realtime multiplayer, and a physical Android device still require dedicated credentials/devices and are not claimed here.

## Evidence (last run)
| Check | Result |
|---|---|
| `npm run typecheck` | pass — 2026-11-26 |
| `npm test -- --run` | pass — 11 files, 96 tests |
| `npm run build` | pass — Vite production build |
| `npm run check:routes` local | pass — 26 manifest routes, HTTP 200 |
| `npm run check:routes` Cloudflare | pass — 26 manifest routes, HTTP 200 |
| Supabase Detective migration | applied to `Puzzle-Game` (`zrbvgtqspekxrnnzegwh`) |
| GitHub merge | `main`, merge commit `4f59245ffd87543c342999764b2081be83bb4c85` |
| Cloudflare production deployment | success on the merge commit |
| Android Debug Admin/User builds | success in GitHub Actions |
| `sh supabase/tests/run_all.sh <db>` (all 8 migrations on a fresh DB) | applies with no errors |
| `supabase/tests/game_engine.sql` (self-grading) | 94 checks `ok`, 0 `FAIL`, three consecutive runs (draws are random) |
| earlier SQL suites (lifecycle, rules, rooms) | print results for human review (expected errors included); reviewed, all as designed. Not self-grading. |

## Features
| Area | Status | Notes |
|---|---|---|
| Auth, roles, permissions, RLS | TESTED (DB) | staff/player separation checked in SQL tests |
| Dashboard stats | IMPLEMENTED | function tested for forbidden access; page not run in a browser |
| Story builder: info, images, ordering, pieces, preview | IMPLEMENTED | jigsaw engine TESTED (39 unit tests: exact coverage, determinism). Upload and PNG rendering need a browser + Supabase |
| Question bank, suggestions, approval, validation, publish | TESTED (DB + unit) | |
| Story rules (scoring, policies, recovery) | TESTED (DB + unit) | room-level override UI missing (API supports it) |
| Story duplication, full-experience preview | NOT STARTED | Milestone 2 leftovers |
| Background image-processing job | NOT STARTED | pieces are generated in the admin's browser (see DECISIONS D12) |
| Rooms, QR, PIN, joining, teams, lobby, image selection | TESTED (DB) / IMPLEMENTED (UI) | |
| Full room snapshot | TESTED (DB) | game played from snapshot after source edits |
| Card lifecycle, draw, answer, place/discard, MINUS/RETRY/SKIP, time limit | TESTED (DB) | |
| Score ledger, idempotency, duplicate prevention | TESTED (DB) | |
| Piece reveal + private piece storage policy | TESTED (DB, stub storage) | real Storage not exercised |
| Softlock detection, recycling, rescue | TESTED (DB) | |
| Captain failover, presence | TESTED (DB) | needs live heartbeat from clients |
| Gameplay screen | IMPLEMENTED | not run in a browser |
| Realtime | IMPLEMENTED | `postgres_changes` + 4-5 s polling fallback; not exercised live, no subscription-isolation test yet |
| Completion, ranking, leaderboard (data) | TESTED (DB) | |
| Final story reveal | NOT STARTED | Milestone 5 leftover |
| Admin users, roles, reports, CSV/PDF print export | IMPLEMENTED | Migration 0009 + `/admin/users` and `/admin/reports`; deployed to Cloudflare |
| Recovery codes for lost sessions, PWA, Cloudflare config, stress tests | NOT STARTED | Milestone 6 |

## Milestone 4 report
1. **Implemented**: server-authoritative engine (see DATABASE_DESIGN.md), gameplay screen, admin live controls (end game, abandon/disqualify, audited score adjustment), recovery settings UI.
2. **Created**: migrations 0007, 0008; `supabase/tests/game_engine.sql`, `run_all.sh`; `src/game/*`; docs.
3. **Modified**: `create_room` (v2, replaced), `set_room_status` (adds `end`), Lobby, RoomControl, RulesPanel, settings, errors, i18n.
4. **Security**: ledger and audit log append-only; piece images readable only for revealed pieces; answers served only from the snapshot and never returned to players; idempotency keys.
5. **Limitations**: see SECURITY_REVIEW.md "Open risks" and the NOT STARTED rows above.
6. **External permissions needed**: a Supabase project (run migrations, enable Anonymous sign-ins), Cloudflare account for deployment.
7. **Next**: Milestone 5 (completion experience, final reveal, reports) and Milestone 2 leftovers.

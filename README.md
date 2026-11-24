# Story Puzzle — Milestone 4 Game Engine

React + TypeScript + Tailwind + Supabase. Arabic/English with RTL, story authoring, rooms, and server-authoritative multiplayer gameplay.

## Setup
1. Create a Supabase project.
2. SQL Editor: run `supabase/migrations/0001_foundation.sql`, `0002_admin_dashboard.sql`, `0003_story_storage.sql`, then `0004_questions_publish.sql`, then `0005_story_rules.sql`, `0006_rooms.sql`, `0007_engine_schema.sql`, `0008_game_engine.sql`.
3. Auth > Providers/Settings: turn ON **Anonymous sign-ins** (players join without accounts). Then Auth > Users > Add user (your admin email + password).
4. Edit the email in `supabase/bootstrap_first_admin.sql` and run it once.
5. `cp .env.example .env` and fill in the project URL and **anon** key (never the service-role key).
6. `npm install && npm run dev`

## Checks
`npm run typecheck` · `npm test` · `npm run build`  (all pass at delivery)

## Security notes
- Permissions in the UI only hide menus; real enforcement is RLS + `has_permission()` in the database.
- Players cannot read answer keys or question-to-piece mappings (staff-only tables).
- Dashboard stats come from `admin_dashboard_stats()`, which checks `report.view` itself.

## Phase 2 so far: jigsaw engine
- `src/puzzle/engine.ts`: seeded interlocking-piece generator (shared edges, exact coverage, original-pixel coordinates).
- `src/puzzle/engine.test.ts`: area-sum and per-pixel coverage tests over 7 image sizes x 4 seeds.
- Admin > Puzzle Lab: pick a local image, piece count and seed, inspect real pieces (nothing is uploaded).

## Phase 2 so far: story builder steps 1-5
- Migration `0003_story_storage.sql`: private buckets `story-originals` and `story-pieces`, staff-only storage policy, `save_image_pieces()` (atomic, audited, refuses published stories, warns before dropping question mappings) and `reorder_story_images()`.
- Admin > Stories: create stories, edit info, upload images (PNG/JPEG/WebP, max 15 MB), reorder, set hint/description, choose piece count + seed, generate and save pieces, preview.
- Each piece is saved as its own transparent PNG in the private bucket so players never need the full original.

## Phase 2 so far: questions, assignment, publish
- Migration `0004`: `save_question`, `set_question_mapping`, `apply_suggested_mappings`, `approve_mappings`, `validate_story`, `publish_story`, `set_story_status`, plus triggers that freeze published stories and block publishing outside `publish_story()`.
- Admin > Stories > (Questions | Assignments | Publish) tabs. Suggestions use title/description keyword overlap, then balanced seeded piece choice; admin reviews and approves.
- SQL tests: `supabase/tests/` (run against plain Postgres with the stub schema; they passed at delivery).

- Migration `0005` + Admin > Stories > Rules: per-story scoring, wrong-answer policy (MINUS/RETRY/SKIP), attempts, time limit, multi-question pieces, recycling. Each value either follows the platform default or is fixed for the story (a fixed value never changes when defaults change). Frozen once published.

## Phase 3: rooms
- Migration `0006`: rooms with unique codes (e.g. `EG-7K29PX`), optional hashed PIN (5 wrong tries per 10 min per player), open or admin-approved joining, admin-made or player-made teams, member limits, captain history, atomic image selection (a unique key makes double selection impossible), readiness, server-side 3-2-1 countdown, pause/resume/cancel, remove player, audit log.
- A story used by an active room is frozen (cannot be unpublished or edited). The room's `settings_snapshot` keeps the effective rules and only player-safe data (image positions and hints), never answers, mappings or image titles.
- Admin > Rooms: create, QR + link, live monitor, approve players, start/pause/resume/cancel, make captain, remove player. Player pages: `/join`, `/join/CODE`, `/play/:roomId`.
- Tests: `sh supabase/tests/run_all.sh <db>` (as a Postgres superuser) rebuilds a scratch database and runs every SQL test.

## Milestone 4: game engine (see /docs)
Server-authoritative gameplay: independent team decks, card lifecycle, MINUS/RETRY/SKIP, place/discard scoring through an append-only ledger, piece reveal with private piece storage, idempotent actions, softlock detection with recycling/rescue, captain failover, completion ranking, admin end/abandon/disqualify/score adjustment (all audited). Status and evidence: `docs/PROJECT_STATUS.md`.

## Remaining work
Final story reveal, reports and PDF/Excel export, full-experience story preview, story duplication,
background image-processing jobs, recovery codes for lost sessions, PWA support, Cloudflare deployment configuration,
and live-device/stress testing. The current gameplay engine is implemented and covered by the database test suite;
real Supabase and device verification should still be performed before production release.

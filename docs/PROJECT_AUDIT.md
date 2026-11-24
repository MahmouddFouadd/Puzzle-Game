# Project audit

Method: read every migration, function, policy, route and test I wrote or changed in this project; ran typecheck, unit tests, build; rebuilt a scratch PostgreSQL 16 database from all migrations and ran the SQL suites. No production data was touched.

## What was found
**Defects found and fixed during development**
- Duplicate explicit RLS policy on `rooms` (harmless, removed).
- `card_draws` had `unique(team_id, question_id)`, which made recycling impossible; replaced by a per-cycle partial unique index (0007).
- Earlier `rooms.access_pin_hash` was readable by room members; moved to `room_secrets` (no policies).
- `set_room_status` lacked an administrator "end" action (added in 0008).
- Tests: platform defaults modified by one suite polluted the next (game suite now resets them); psql swallowed an unbalanced statement (fixed). These were test defects, not engine defects.

**Open findings (not fixed yet)** are listed in SECURITY_REVIEW.md and IMPLEMENTATION_ROADMAP.md.

## Classification
- **Fully implemented and tested (DB level)**: roles/permissions, story publishing and freeze, mappings and validation, rules overrides, rooms/teams/captains, image reservation, snapshot, game engine, ledger, recovery, failover.
- **Implemented but untested**: every React page; image upload and piece PNG rendering; Realtime; storage policies on real Supabase.
- **Partially implemented**: story builder (no duplication, no full preview, no server-side processing job); settings hierarchy (room level only through the API).
- **Missing**: final reveal, reports/exports, recovery codes, PWA, deployment config, stress tests, subscription-isolation test.
- **Broken**: none known.
- **Security-sensitive**: `create_room` snapshot (contains answers; table has no player policy), storage policy `team_revealed_pieces_read`, idempotency table, `heartbeat`, all SECURITY DEFINER functions (each sets `search_path` and checks `auth.uid()`).
- **Requires external credentials**: Supabase project, Anonymous sign-ins switch, Cloudflare Pages.

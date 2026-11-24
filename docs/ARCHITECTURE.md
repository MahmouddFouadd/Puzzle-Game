# Architecture

## Layers
- **UI** (`src/pages`, `src/components`, `src/game`): rendering only. No score, answer or ownership logic.
- **Domain helpers** (`src/puzzle`, `src/questions`, `src/stories`, `src/rooms`): pure TypeScript (jigsaw geometry, suggestion algorithm, settings merge, code formatting) with unit tests.
- **Data access** (`*/api.ts`): thin wrappers over Supabase RPC/queries. Every gameplay call carries an idempotency key.
- **Database** (`supabase/migrations`): the single source of truth and the only place game rules run.

## Trust boundary
Players hold an anonymous Supabase session. They can read only what RLS allows and call only granted functions. They cannot write any game table. Functions are `SECURITY DEFINER` with a fixed `search_path`, check `auth.uid()` themselves, and internal helpers are not granted to the API roles.

## Game data flow
`draw_card` → `submit_answer` → `decide_card` (captain only, one team lock per action). Questions, answer keys, mappings and geometry live in `room_story_snapshots` (no player policy). Players receive a *card view* (text, type, options, hint) and, after a correct placement, the revealed piece geometry plus a storage path whose object they may then read.

## State machines
- Room: WAITING ⇄ READY → COUNTDOWN → PLAYING ⇄ PAUSED → FINISHED; CANCELLED from any open state.
- Team: ACTIVE → COMPLETED (through play) | ABANDONED | DISQUALIFIED (admin, with reason). Progress is never deleted.
- Card draw: DRAWN → ANSWER_CORRECT → PLACED_CORRECTLY | PLACED_INCORRECTLY | DISCARDED_CORRECTLY | DISCARDED_INCORRECTLY; DRAWN → ANSWER_INCORRECT. "Available" = no draw row yet; "recycled" = `recycled_at` set on a closed draw.

## Realtime
Realtime events are hints. Clients react by re-reading authoritative state (`get_team_state`, `get_leaderboard`); a 4-5 s poll and a `visibilitychange`/`online` refresh cover missed events. Event visibility is `ROOM` (everyone in the room) or `TEAM` (that team + staff), enforced by RLS on `game_events`. `game_events.id` is the global sequence number for resync.

## Presence and failover
Clients call `heartbeat(room)` every 10 s. Members silent for 30 s are marked offline; a captain silent longer than the room's grace period is replaced by the most recently seen online teammate, in the same transaction, with a history row. No cron dependency.

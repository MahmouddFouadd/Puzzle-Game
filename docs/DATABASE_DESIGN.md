# Database design

## Migrations (apply in order, never edit applied ones)
0001 foundation (identity, stories, questions, rooms, game tables, RLS) · 0002 dashboard + `grant_role` · 0003 storage buckets, `save_image_pieces`, `reorder_story_images` · 0004 questions, mappings, validation, publish · 0005 story rules + settings guard · 0006 rooms, teams, captains, image selection, start · 0007 engine schema, full snapshot, `create_room` v2 · 0008 game engine functions.

## Logical tables from the V2 list → what exists
| V2 name | Implementation |
|---|---|
| profiles, user_roles, role_permissions | same |
| user_sessions, access_tokens | **not created**: Supabase Auth sessions; recovery codes planned (Milestone 6) |
| stories, story_settings, story_images, story_connections, puzzle_generation_jobs, puzzle_pieces | same (jobs table exists but unused: see DECISIONS D12) |
| puzzle_piece_geometry | merged into `puzzle_pieces.svg_path/x/y/w/h` |
| questions, question_options, accepted_answers, question_piece_mappings | same; `question_categories` not created (free-text category on stories) |
| rooms, room_members, teams, team_members | same |
| room_settings | `rooms.settings_snapshot.settings` (effective values, incl. room overrides) |
| room_story_snapshots | same (staff-only read) |
| team_captains | `teams.captain_user_id` + `team_captain_history` |
| team_game_states, team_image_assignments | same |
| team_decks | derived: deck = snapshot questions minus this team's draws in the current cycle (`card_draws`, `team_game_states.deck_cycle`) |
| card_draws, card_answers, card_decisions, team_piece_states | same, extended (state, kind, cycle, attempts) |
| team_scores, score_ledger | `team_game_states.score` + append-only `score_ledger` |
| game_events | same, with `visibility` |
| game_rankings | `team_game_states.rank` + `completed_at` (set once, never recalculated) |
| team_recovery_states, idempotency_keys | new |
| audit_logs, security_events | same; audit append-only |
| game_reports, team_statistics | not created yet (reports will be queries/views over persisted tables) |

## Key constraints
- One image per team and per room: PK `(room_id, image_id)` and `unique(room_id, team_id)`.
- One open card per team: partial unique index on `card_draws(team_id)` where state is DRAWN/ANSWER_CORRECT.
- No repeat inside a cycle: unique `(team_id, question_id, cycle)` where kind ≠ RESCUE.
- One decision per draw (`card_decisions.draw_id` unique); one reveal per piece per team (PK).
- Ledger/audit: `forbid_mutation` triggers.
- Game history stores plain ids (no FKs into story tables) so later story edits cannot break it.

## Public functions (granted to `authenticated`)
Rooms: `create_room`, `room_preview`, `join_room`, `resolve_member`, `create_team`, `join_team`, `leave_team`, `set_team_captain`, `select_image`, `set_team_ready`, `start_game`, `advance_room`, `set_room_status`, `remove_player`.
Game: `draw_card`, `draw_rescue_card`, `submit_answer`, `decide_card`, `get_team_state`, `get_leaderboard`, `heartbeat`, `set_team_state`, `adjust_score`.
Internal only: `apply_score`, `check_softlock`, `card_view`, `snap_*`, `setting_*`, `idem_*`, `lock_team_for_action`, `emit_event`, `maybe_finish_room`, `normalize_answer`.

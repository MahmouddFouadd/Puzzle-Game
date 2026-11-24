# Security review

Evidence column = where it is tested. "DB" = `supabase/tests/game_engine.sql` unless stated. All run on plain PostgreSQL with stand-in Supabase schemas, not on real Supabase.

## V2 §19: what a player must not be able to do
| # | Abuse | Prevention | Evidence |
|---|---|---|---|
| 1 | Change their score | no write policies; only `apply_score` writes, via captain actions | DB: direct update has no effect; direct ledger insert denied |
| 2 | Reveal a hidden piece | reveal only inside `decide_card`; direct insert into `team_piece_states` denied | DB |
| 3 | Read correct answers | answers only in snapshot; card view omits them; secret tables return 0 rows | DB (JSON scan + row counts) |
| 4 | Read hidden associations | mappings/snapshot unreadable; piece→image data never in card view | DB |
| 5 | Access another team's deck | RLS `is_team_member`; TEAM events private | DB (draws, pieces, ledger, state = 0 rows) |
| 6 | Access another room | RLS `is_room_member`; functions check membership | DB (rooms suite) |
| 7 | Become captain | captain set by server rules only; `set_team_captain` needs captain/admin | DB + rooms suite |
| 8 | Bypass team capacity | row lock + count in `join_team` | rooms suite |
| 9 | Decide for another team | team derived from the draw; captain check | DB |
| 10 | Replay for extra points | idempotency keys + one decision per draw + state checks | DB (replay returns same result, score unchanged) |

Also tested: PIN hashing and attempt limit (rooms suite), append-only ledger/audit (DB), revealed-piece-only storage policy (DB, stub storage), published-story freeze (lifecycle suite).

## Open risks (honest list)
1. **Realtime isolation not tested live.** `postgres_changes` applies RLS, but no test subscribes as another room's user. Needed before release.
2. **Room code guessing**: PIN attempts are limited, but unprotected (no-PIN) rooms can be probed through `room_preview`. Add rate limiting at the edge/API gateway.
3. **Anonymous session loss** (cleared browser data) cannot be recovered yet. Recovery codes planned.
4. **Storage policy on real Supabase** is untested; the stub only has `name`/`bucket_id`.
5. **Signed URL lifetime** for piece images is 1 h; a leaked URL shows only already-revealed pieces.
6. **Client-side piece generation**: a malicious *admin* could store wrong geometry. Admin-only trust, but server-side validation of reconstruction is planned with the processing job.
7. Admin actions use `window.prompt`; acceptable for staff, not final UX.
8. No CSP/headers yet (Cloudflare Pages `_headers` pending); React escapes output, no raw HTML is rendered.
9. Service-role key is never used by the app; confirm in deployment docs when written.

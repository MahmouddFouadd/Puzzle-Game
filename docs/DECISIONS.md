# Decisions

D1 **Snapshot + freeze.** Each room gets a full immutable snapshot (`room_story_snapshots`); the story is also frozen while a room is active. Gameplay reads only the snapshot. Reason: V2 §5, and defence in depth.
D2 **Settings hierarchy.** Platform default → story override (NULL = follow default) → room override (whitelisted, validated, passed to `create_room`). Room override UI not built yet.
D3 **History without foreign keys** into story tables, so edits/deletes of the story never break finished games.
D4 **Fog, not blur.** Players never receive the full image, so the hidden region is drawn as fog; only revealed pieces are real image data. A blurred copy would leak the picture.
D5 **Recycling pool** = all drawn cards not correctly placed (decoys included), so recovery never reveals which cards belong. Max cycles configurable (default 1; recycling itself off by default).
D6 **Rescue draw** = one extra card from that same pool, only when the deck is empty, limited count, optional point cost, optionally non-repeating.
D7 **Softlock** is recorded when no undrawn question can reveal a hidden piece; recovery is applied when the deck is exhausted (so no recycling while cards remain). The team is told only "stuck/rescue available".
D8 **RETRY with attempts used up** pays the wrong-answer penalty. **Time limit expiry** counts as a wrong answer (final).
D9 **Idempotency** is per (user, key) with an advisory lock; `select_image`, `set_team_ready`, `set_team_captain` are naturally idempotent (same input, same state) so they take no key.
D10 **Failover** runs inside `heartbeat` (no cron). Presence = 30 s; grace is a setting (default 20 s). The old captain is *not* restored automatically; explicit handover or admin action only.
D11 **Ranking** is assigned at completion under a room lock using the server clock and stored permanently. Room finishes when no ACTIVE team remains and at least one COMPLETED (or admin ends it).
D12 **Piece generation stays client-side for now.** A true background job needs an Edge Function with an image library and deployment credentials. The `puzzle_generation_jobs` table is reserved for it.
D13 **Admin score changes** are only ledger events (`ADMIN_ADJUSTMENT`) with a mandatory reason and an audit record.
D14 **Only published questions with an approved mapping** enter the snapshot. Unmapped questions are excluded.
D15 **Conflict noted:** V2 asks for a "blurred" hidden image (original spec) and "never expose the full image". Resolved by D4.

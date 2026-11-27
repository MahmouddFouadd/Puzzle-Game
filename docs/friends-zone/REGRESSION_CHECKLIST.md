# FRIENDS ZONE — Regression Checklist

Run after every phase. Mark only what was actually executed. `A` = automated, `M` = manual/Playwright screenshot.

## Automated gates
- [ ] A `npx tsc --noEmit`
- [ ] A `npx vitest run` (unit tests: rooms util, publicUrl, shuffle, hotspot geometry, voice core, bakasa legacy, …)
- [ ] A `npm run build`
- [ ] A `supabase/tests/run_all.sh` on a scratch Postgres (incl. `player_hosted_rooms`, `voice_chat_policies`, `game_engine`)
- [ ] A `supabase/tests/detective_case_packs.sql` (all case packs playable, no answer leaks)

## Story Puzzle
- [ ] Join by code / invite link auto-join
- [ ] Player creates room → picks story card (title/cover only) → lobby shows title
- [ ] Host can change story before start; other players see the notice; host cannot see content
- [ ] Teams, captain, image choice, ready, host start / admin start, countdown
- [ ] Card draw, answer, place/discard, **wrong answer = −10 & discard by default**, per-story policy override respected
- [ ] Options shown shuffled; grading unchanged
- [ ] Results / leaderboard
## Detective
- [ ] Catalog, briefing, tap-to-find hotspots, close-up reveal, notebook, scene progress
- [ ] Hints, board links, questions by stage, final conclusion, report
- [ ] Team / competitive parties, invite auto-join
- [ ] Admin hotspot editor: draw/move/resize/save/preview
## Bakasa
- [ ] Online: create, join, scratch card, question pairs, vote, spy guess, scores, rematch
- [ ] Pass-and-play identical behaviour (golden transcript `phase2/golden_ui.cjs`)
## Voice
- [ ] Mic off by default; opt-in prompt; open mic; push-to-talk; mute; speaking indicator; leave
- [ ] Non-members cannot join a room's voice channel
## Admin
- [ ] Dashboard KPIs, stories, questions, rules (wrong-answer policy), publish, player-room availability checkbox
- [ ] Rooms + room control, Detective studio, Bakasa admin, users/roles, reports, settings
- [ ] No permission weakened (RLS tests above)
## Platform
- [ ] Arabic RTL and English LTR on every redesigned screen
- [ ] 360px phone, tablet, desktop: no horizontal overflow
- [ ] PWA install, icons, favicon, service-worker update
- [ ] Android debug APK builds in CI; launcher icon, splash, app label; package id unchanged
- [ ] Share links point to the public site
- [ ] Keyboard focus visible; reduced motion respected; contrast ≥ 4.5:1 for text

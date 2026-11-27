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

---
## Phase 3 run — 2026-11-27 (branch `ccr-62950cb5-i5oqn9`)
Executed, all passed unless noted. Browser checks ran against a production build with Supabase mocked (no production data touched).

| Check | How | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| Unit/component tests | `npx vitest run` | ✅ 19 files, 134 tests (new: `recentGames.test.ts` 6, `components/fz/fz.test.tsx` 6) |
| Production build | `npm run build` | ✅ built; main chunk 890 kB (+15 kB); pre-existing >500 kB chunk warning (ExcelJS) unchanged |
| SQL suites | `supabase/tests/run_all.sh` on local Postgres 16 | ✅ 129 `ok`, 0 `FAIL`, exit 0 (incl. `player_hosted_rooms` 35 ok = story-selection privacy + host limits, `voice_chat_policies` PASS) |
| Detective packs | `detective_case_packs.sql` | ✅ 4/4 PASS (no answers in player payload) |
| Bakasa pass-and-play | golden transcript (3 seeded games, 103 lines) | ✅ identical to pre-change baseline (harness now waits for the first pass screen; the old harness raced on line 0) |
| Home AR/EN, phone (Pixel 7), 360 px, tablet 820, desktop 1440 | Playwright screenshots (`docs/friends-zone/phase3/*.jpg`) | ✅ no horizontal overflow, `dir` correct, no page errors |
| Navigation | mode cards → `/game/story`, `/detective`, `/bakasa`; bottom tabs (5) incl. active state; Create room → guest gate on `/play/new`; Join-with-code routing BK-/DT-/story; `#join` anchor; keyboard focus ring | ✅ 14/14 |
| Create room + story selection | `/play/new` title-only cards → lobby → host changes story | ✅ |
| Detective session | tap-to-find, reveal card, notebook | ✅ no errors |
| Staff login / logout | admin logs in → `/admin`, brand visible, sign-out calls `/logout`, `/admin` then redirects to `/login` | ✅ |
| Player/admin permissions | signed-in player without permissions opening `/admin/stories` | ✅ "not allowed" shown |
| PWA | manifest name, icons exist and sizes match, favicon/apple-touch, SW cache renamed + old caches deleted | ✅ |
| Android | launcher/round 48–192, adaptive foreground 108 dp canvas per density, splash port/land all densities, labels "Friends Zone"/"Friends Zone Admin", `applicationId com.storypuzzle.app` unchanged | ✅ (APK not built here: no Android SDK in this container; CI workflow builds it) |

Not covered this phase: real-device Android run, live Supabase multiplayer with several real players (needs deploy), admin dashboard with empty mocked KPIs (crashes on mock shape `total`; pre-existing, real RPC returns the object).

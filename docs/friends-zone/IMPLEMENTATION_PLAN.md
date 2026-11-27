# FRIENDS ZONE — Implementation Plan

Principle: **restyle, don't rewrite.** Every phase changes presentation only, keeps data contracts, and ends with tests + screenshots. Nothing is pushed or deployed without the owner's approval.

## Phase 1 — Audit ✅
`BRANDING_AUDIT.md`, this plan, `REGRESSION_CHECKLIST.md`.

## Phase 2 — Brand foundation
* **Design tokens** (`src/brand/tokens.css` + Tailwind `fz.*` palette): Midnight Navy #101426, Deep Purple #6D4AFF, Electric Cyan #20D5D2, Neon Blue #3887FF, Soft White #F5F5FA, Secondary Gray #A5A9BB, Accent Gold #E5B85C; surfaces, radii, shadows, spacing, motion (with `prefers-reduced-motion`).
* **Typography**: display — *Baloo Bhaijaan 2* (one family covering Arabic + Latin, rounded and friendly); body — *Cairo* (already loaded). Fraunces retired after migration.
* **Logo system** (SVG, hand-built): "the Zone" mark — two friend nodes joined inside an open ring that forms a stylised **Z** path, with a small play-notch; FZ monogram; horizontal EN, horizontal AR, stacked bilingual; mono versions.
* **Icon set** (`src/brand/icons.tsx`): one 24px grid, 2px rounded stroke, for Story, Detective, Bakasa, Multiplayer, Voice/Mic on/off, Challenges, Leaderboard, Friends, Rooms, Profile, Settings, Notifications, Achievements, Results, Admin, Play, Join, Create, Back, Close, Hint, Timer, Score.
* **Generated assets** (script `scripts/brand-assets.mjs`, sharp): favicon (svg + 32/16 png), PWA 192/512 + maskable, Apple touch, Android legacy + adaptive mipmaps, splash (portrait/landscape all densities), social avatar 1024, OG share image 1200×630, background pattern.
* **Brand board** page `docs/friends-zone/brand-board.html` for review.
* No app screen changes yet.

## Phase 3 — Core interface
App name/meta/manifest/Capacitor labels; `<Logo/>` replaces `StoryLogo`; animated loading screen; guest entry + staff login restyle; Home redesign (greeting, avatar, Quick Play, Create Room, Join Room, game modes, **recent games from existing history RPCs**); TabBar; game-mode pages with per-mode accent on the shared system.

## Phase 4 — Gameplay
Story Puzzle (lobby, host panel, story cards with title/cover/category/difficulty only, game screen, results), Detective (catalog, briefing, scene viewer, evidence notebook, suspects, timeline, accusation, report — **interactive discovery unchanged**), Bakasa (intro, lobby, scratch card, Q pairs, vote, guess, results), shared results/scoreboard components. Scoring logic untouched.

## Phase 5 — Social
Rooms (create/join/code/settings/ready/leave/reconnect UI), Voice bar redesign (per-player mic state, speaking ring, connection state). Friends, challenges, notifications, global leaderboard: **only after the owner approves the backend scope in BRANDING_AUDIT §5.**

## Phase 6 — Administration
Admin shell (sidebar, search, filters, tables, detail panels, dialogs, toasts) applied to all existing admin pages; no permission changes.

## Phase 7 — Responsive & localization
Breakpoint pass (360 / 768 / 1024 / 1440), safe areas, RTL/LTR audit with logical properties, keyboard/focus, contrast.

## Phase 8 — QA & delivery
Full `REGRESSION_CHECKLIST.md`, screenshot set, testing report, modified-file list, rollback notes, release docs, new APK.

## Rollback
Each phase is one or more commits on a branch merged via PR; rollback = revert the PR. No migrations are planned for Phases 2–4, 6–8. Android package id and signing never change, so installed apps update in place.

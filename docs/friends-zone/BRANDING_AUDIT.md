# FRIENDS ZONE — Branding Audit (Phase 1)

Audited on 2026-11-27 against `main` @ `819ebf7` (after PR #14). Read-only: nothing in the app was changed for this audit.

## 1. Architecture (what the rebrand must sit on)

| Layer | Current implementation | Rebrand impact |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite 5, React Router 6, Tailwind 3 (`tailwind.config.js`, 19 lines) + hand-written component CSS in `src/index.css` (125 lines) | Main work area |
| i18n | `src/lib/i18n.tsx` dictionary (`t()` keys, `ar`/`en`, `dir` switch) **plus** many newer screens that inline `ar ? '…' : '…'` strings | Brand strings live in both places |
| Backend | Supabase: Postgres + RLS + ~150 `security definer` RPCs (migrations 0001–0028), Realtime (rooms, Bakasa, Detective parties, voice signaling), private Storage buckets | **No changes needed** for branding |
| Auth | `AuthProvider`: email + password (`signInWithPassword`) for staff; **anonymous guest sign-in with a display name** (`RequirePlayer`) for players. No player registration, password recovery or email verification screens exist | See §5 — new auth screens are new features |
| Hosting | Cloudflare Pages (`cloudflare-pages-production.yml` on push to `main`), `public/_headers`, `_redirects`, service worker `public/sw.js`, PWA `manifest.webmanifest` | Names, icons, theme colours, SW cache name |
| Mobile | Capacitor 6.2 Android, `appId` **`com.storypuzzle.app`**, flavors `admin` (`.admin`) / `user`, labels "Story Puzzle Admin/Player", `MainActivity.java` in `com/storypuzzle/app`, launcher mipmaps + splash drawables, workflows `android-apk.yml` / `android-release.yml` | Labels, icons, splash only. **Package id and signing stay unchanged** (requirement 14) |
| Voice | `src/voice/*` (WebRTC mesh, Supabase Realtime private channels, `VoiceBar`) | Restyle only |

## 2. Current visual identity — four parallel systems

The app has grown four separate design languages that the rebrand should unify into one token set:

| System | Where | CSS families | Fonts / colours |
|---|---|---|---|
| "Treasure map" (original) | Story Puzzle join/lobby/game, Login, admin cards | `.story-*`, `.parchment-*`, `.btn-*`, `.card`, `.hero-*`, `.team-*`, `.code-*` | Fraunces + Cairo; parchment/ink/gold/sea tokens in `tailwind.config.js` |
| Arcade | Home, Game detail, Profile, TabBar | `.ar-*` (15) | Cairo; hard-coded gradients per game in `src/lib/games.tsx` |
| Bakasa | All `/bakasa/*` | `.bk-*` (22) | `bk` palette (purple/accent/pink/cyan/lime) |
| Detective | All `/detective/*` | `.det-*` (16) | hard-coded hex (#0d1626, #f5a623, #2dd4bf …) |
| Admin | `/admin/*` | `.admin-*`, `.dashboard-*`, `.metric-*`, `.activity-*` | mixed |

Icons: mostly **emoji** (🔍 📁 🧷 👥 🕒 📝 🎤 ▶ ✕ …) plus a few SVG illustrations (`GameArt.tsx`, `StoryArt.tsx`). Requirement 13 asks for a consistent icon set instead of emoji as primary icons.

## 3. Every place the old brand appears

| File | What | Action |
|---|---|---|
| `index.html` | `<title>Story Puzzle</title>`, theme colour, font links | Rename, new fonts/meta, OG tags |
| `public/manifest.webmanifest` | `"name": "لغز الحكاية — Story Puzzle"`, icons, colours | Rename + new icons |
| `public/icon.svg`, `icon-192.png`, `icon-512.png` | Old icon | Replace |
| `public/sw.js` | Cache name containing the old brand | Rename cache (forces clean update) |
| `src/lib/i18n.tsx` | `appName: 'Story Puzzle'`, `modePuzzleTitle` | `appName` → FRIENDS ZONE / فريندز زون. **Game-mode name "Story Puzzle / أحجية الحكاية" stays as a mode inside the platform** |
| `src/lib/games.tsx` | Mode titles, gradients, art | Keep mode names; move colours to tokens; new icons |
| `src/components/StoryArt.tsx` | `StoryLogo` used as the app logo (RequirePlayer, Login…) | Replace with FZ logo component |
| `src/pages/admin/AdminLayout.tsx`, `Dashboard.tsx`, `ContentStudio.tsx`, `Reports.tsx`, `ContentImport.tsx` | Brand text in admin chrome / exports | Rename where it names the platform; keep where it names the mode |
| `capacitor.config.ts` | `appName: 'Story Puzzle'`, splash colour | Rename + colours (**not `appId`**) |
| `android/app/src/main/res/values/strings.xml`, `build.gradle` flavor labels | App labels | "Friends Zone" / "Friends Zone Admin" |
| `android/app/src/main/res/mipmap-*`, `drawable*/splash.png` | Launcher + splash | Regenerate |
| `.github/workflows/*.yml` | Artifact names (`story-puzzle-*`) | Optional rename; release signing untouched |
| `README.md`, `TODO.md`, `package.json` `name` | Docs / package name | Docs rename; `package.json` name optional (no runtime effect) |
| `supabase/migrations/0001…`, seed packs | Comments / case text only | **Do not edit applied migrations** |

## 4. Functionality that must not change (protected)

* All Supabase schema, RLS, RPC contracts and data; story/case/user ids; storage paths.
* Story Puzzle engine: snapshots, card draw, answer, place/discard, scoring incl. **default wrong-answer policy MINUS (−10, card discarded)** and per-story overrides (`story_settings`, Rules panel).
* Player-hosted rooms (0027): host sees title/cover only; host may only choose/change story, start a ready room, close own lobby.
* Detective: server-side hotspot inspection, hidden evidence, hints, board, report, parties, hotspot editor.
* Bakasa: rules v2 (scratch card, question pairs, individual votes, spy guess, scoring), online + pass-and-play.
* Voice: online only, mic off by default, opt-in, no recording. **Local Network stays paused** (unpushed branch `local-network-phase2`).
* Share links via `shareUrl()` to the public site; invite auto-join.
* Android `applicationId`, flavors, signing config, CI pipeline; Cloudflare deploy.

## 5. Gaps: requested items that are new features, not a redesign

The master prompt lists screens that have **no backend today**. Building their look without data would show fake content, so they need separate approval (and migrations) before Phase 5:

| Requested | Today | Needed |
|---|---|---|
| Registration, password recovery, email verification, profile setup | Players are anonymous guests with a name; only staff use email login | Decide: keep guest-first (recommended) or add player accounts (Supabase Auth email flows + profile table) |
| Online friends, friends list | None | `friendships` table, presence, invites |
| Active challenges, achievements | None | challenge/achievement definitions + progress |
| Global leaderboard preview | Per-room leaderboards only (Story `get_leaderboard`, Bakasa/Detective results) | Aggregation RPC across modes |
| Notifications | None (toasts only) | notifications table + Realtime |
| Recent games | Bakasa history, Detective history exist; Story history partial | A cross-mode "recent games" RPC (read-only, feasible) |

Recommendation: Phases 2–4 restyle everything that exists; Home shows only real data (recent games, modes, create/join). Friends/challenges/notifications become a separate, approved "Social" milestone.

## 6. Conflicts found in the attached files

* `20261127180000_public_story_context.sql` (attached, **not in the repo, not applied**) grants `select` on `stories.description` (and other columns) to `anon, authenticated` and pins descriptions into room snapshots; `StoryBrowser` lists story descriptions publicly. This **contradicts** the approved story-privacy rule (host sees title/cover/category/difficulty/duration only; no plot) and reverses what migration 0027 removed. It must not be applied as is. If public "story context" is wanted, it needs a separate decision on which field is safe teaser text (e.g. a new admin-written `teaser` column), not `description`.
* `Story_Puzzle_delivery_checklist.md` is out of date: the Blue Moonflower case images exist and the case is published; the Detective runtime/editor items it lists as open are largely implemented (hotspot inspection, hints, board, parties, hotspot editor).

## 7. Technical risks

| Risk | Mitigation |
|---|---|
| Unifying four CSS systems can break layouts in game screens | Token layer first; migrate screen by screen; Playwright screenshot diff of key screens (AR + EN, mobile + desktop) before/after |
| Service-worker cached old shell after rename | Bump SW cache name; verify update path |
| Android launcher icon caching / adaptive icon mask | Generate full mipmap set + `mipmap-anydpi-v26` foreground/background; test on build artifact |
| RTL regressions from new layouts | Logical properties (`ms-/me-/start/end`) only; RTL screenshot checks |
| Fonts increasing load time | Max 2 families, `display=swap`, subset weights |
| Hidden-content leaks in new story cards | Cards consume only `list_selectable_stories` / existing safe RPCs; regression SQL tests stay in `run_all.sh` |
| Renaming `package.json`/workflow artifact names breaks automation | Leave identifiers that other systems rely on; rename only labels |

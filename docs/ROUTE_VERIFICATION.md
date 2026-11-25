# Route and delivery verification

Date: 2026-11-26

## Automated checks

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test -- --run` | PASS — 11 files, 96 tests |
| `npm run build` | PASS — Vite production build generated `dist/` |
| Local route check | PASS — 26 manifest routes returned HTTP 200 |
| Cloudflare route check | PASS — 26 manifest routes returned HTTP 200 |
| `GET /manus-routes.json` local and production | PASS — valid JSON manifest |
| `unzip -t docs/source-materials/drafts-review.zip` | PASS |

The route checker replaces dynamic parameters with `sample`, so it verifies serving and SPA route handling. It does not replace an authenticated browser session, database-backed interaction, realtime testing, or a real Android device.

## Public deployment observed

- Production: <https://puzzle-game-652.pages.dev>
- Last previously confirmed deployment alias: <https://3bfaf60e.puzzle-game-652.pages.dev>
- Last confirmed merge commit: `4f59245ffd87543c342999764b2081be83bb4c85`

The route check confirms HTTP availability of the current public frontend. It does not prove that protected admin pages are usable without valid Auth, permissions, existing story assets, and database records.

## Route coverage

The current manifest declares 26 routes covering home, login, join, play, admin stories, content library, rooms, puzzle lab, users, reports, and settings. It does not declare Detective Mode routes because the current milestone contains the database/domain foundation only; Detective Studio, scene editor, and player investigation UI are not implemented yet.

## Data status

The current Supabase inventory observed 14 story rows: one `PUBLISHED` and 13 `DRAFT`. The supplied editorial ZIP remains draft-only. The Detective seed is packaged for test/staging and was not applied to production.

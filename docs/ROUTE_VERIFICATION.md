# Route and delivery verification

Date: 2026-11-26

## Automated checks

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test -- --run` | PASS — 11 files, 96 tests |
| `npm run build` | PASS — Vite production build generated `dist/` |
| Local route check | PASS — 30 manifest routes returned HTTP 200 |
| `GET /manus-routes.json` local and production | PASS — valid JSON manifest with 30 routes |
| Production Detective assets | PASS — both SVG scene assets returned HTTP 200 |
| Supabase Detective runtime migration | PASS — applied to `Puzzle-Game` (`zrbvgtqspekxrnnzegwh`) |
| Supabase publish validator | PASS — migration applied and functions verified |

The route checker replaces dynamic parameters with `sample`, so it verifies serving and SPA route handling. It does not replace an authenticated browser session, database-backed interaction, realtime testing, or a real Android device.

## Public deployment

- Production: <https://puzzle-game-652.pages.dev>

The new Detective UI is deployed from commit `88f93113364de76482f57b857a0684da3a1aec35`. GitHub Actions Cloudflare production deployment completed successfully.

## Route coverage

The manifest declares 30 routes covering home, login, join, play, admin stories, content library, rooms, puzzle lab, users, reports, settings, Detective Catalog, Detective Session, Detective Studio, and the Detective case editor.

## Data status

The Detective seed remains packaged for test/staging and was not applied to production. This avoids publishing unapproved demo content. The production player catalog will remain empty until an authorized `story.manage` user creates and publishes a complete case through Detective Studio; the server-side publish validator rejects incomplete cases.

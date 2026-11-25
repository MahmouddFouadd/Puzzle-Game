# Testing data pack

This pack prepares controlled test data without changing the shared production database.

## What is included

- `fixtures/story-catalog.snapshot.json`: bounded read-only inventory of the 14 story rows observed in Supabase on 2026-11-25. It is a snapshot, not an import file.
- `docs/source-materials/drafts-review.zip`: the supplied editorial review pack. Its 14 reports and proposed questions remain draft material and are not publish-ready.
- `supabase/seed/detective_demo_case.sql`: a complete Detective Mode demo case for a test/staging Supabase project. It includes one published case/version, two scenes, three stages, three evidence items, one evidence relation, three questions, two suspects, two statements, two hints, one solution, three timeline events, one solo session, and player progress.
- `public/demo/detective/scene-1.svg` and `scene-2.svg`: lightweight local demo scene assets.

## Safe execution

1. Create a dedicated Supabase test/staging project and apply the repository migrations, including `0012_detective_mode_foundation.sql`.
2. Create at least one test Auth user in that project.
3. Upload or register the two demo SVG assets using the project's normal Storage workflow if the client expects Storage paths rather than static public files.
4. Run `supabase/seed/detective_demo_case.sql` using an authenticated database connection in the test project.
5. Verify the bounded queries at the bottom of the seed file and test the existing room/player flows separately.

Do **not** run the demo seed against the shared production project. It creates a published demonstration case and a playing session intentionally, and the current application does not yet expose Detective Studio or player investigation routes.

## Story testing reality

The live project currently contains 14 story rows: one `PUBLISHED` story and 13 `DRAFT` stories. The supplied review ZIP reports 228 proposed questions, but those are editorial proposals, not question rows, answer keys, images, generated puzzle pieces, mappings, or approvals. The pack therefore preserves them as review material instead of importing unverified content.

For the existing story product, use an authorized test account and the current admin routes to inspect and validate each story. Publishing still requires the existing server-side validator and approved assets/mappings. No claim is made here that all 14 stories are playable.

## Verification commands

```bash
npm ci
npm run typecheck
npm test -- --run
npm run build
npm run dev -- --host 127.0.0.1 --port 4173
npm run check:routes -- http://127.0.0.1:4173
npm run check:routes -- https://puzzle-game-652.pages.dev
```

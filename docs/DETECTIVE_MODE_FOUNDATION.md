# Detective Mode — Foundation Milestone

Date: 2026-11-25

## Scope implemented

This milestone adds an additive database foundation for Detective Mode without replacing the existing room, authentication, realtime, or scoring systems.

- `supabase/migrations/0012_detective_mode_foundation.sql` adds versioned cases, scenes, stages, normalized evidence hotspots, evidence relationships, question definitions, suspects/statements, hints, solutions, timelines, sessions, progress, discoveries, submissions, notes, deductions, and score events.
- All coordinates are normalized percentages with database range checks.
- Player-facing data is separated from answer keys and administrator-only explanations.
- RLS is enabled on every new table. Staff content management uses the existing `story.manage` permission. Player reads are scoped to their session/user.
- `get_detective_case_catalog()` returns only published catalog fields.
- `discover_detective_evidence()` records an idempotent discovery row through a server-side function.
- `src/detective/validation.ts` contains pure unlock and answer-evaluation rules for the UI/domain layer.
- `src/detective/validation.test.ts` covers progressive unlocks, manual unlocks, alternatives, penalties, repeated submissions, and multiple-select ordering.

## Verification

- `npm run typecheck`: passed.
- `npm test -- --run`: passed, 96 tests.
- `npm run build`: baseline passed before this milestone; rerun before delivery.
- Scratch SQL suite: not run because `psql` is unavailable in the sandbox.
- Live Supabase migration: not applied yet in this milestone.

## Deliberate non-goals

This is not the complete Detective Mode product. It does not yet include the Studio screens, scene editor, secure question submission RPC, publish validator, suspect interrogation UI, timeline solver, player notebook UI, room integration, realtime events, analytics, or the demonstration case. The ZIP content remains outside production because its supplied review files explicitly mark the content as draft.

## Next migration/work

1. Validate and apply this migration in a controlled Supabase environment.
2. Add a publish validator and question-submission RPC with idempotency and server-side answer checks.
3. Add Detective Studio screens using the existing admin layout and permissions.
4. Add player investigation screens and integrate sessions with existing rooms.
5. Add SQL and realtime security tests before any production publication.

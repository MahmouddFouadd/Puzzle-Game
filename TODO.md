# Story Puzzle delivery checklist

- [x] Platform administrators can edit minimum and maximum validation limits for puzzle pieces, teams, and team members from `/admin/settings`; Supabase validates the limits server-side.
- [x] Admin Dashboard has the updated modern dashboard-v14-inspired layout while preserving existing admin routes and bilingual Arabic/English text.
- [x] PuzzleLab, StoryEditor, and Rooms load their relevant limits from `platform_settings` instead of using fixed UI bounds.
- [x] Android uses a Capacitor shell with the Story Puzzle application identity and the reference shell's launcher/splash structure.
- [x] GitHub Actions builds a debug APK and uploads `app-debug.apk` as the `story-puzzle-debug-apk` artifact.
- [x] Migration `0010_configurable_limits.sql` is applied to Supabase.
- [x] `npm run typecheck`, `npm test -- --run` (65 tests), and `npm run build` pass.
- [ ] GitHub Actions must be run from the repository's Actions tab to produce the downloadable APK artifact.

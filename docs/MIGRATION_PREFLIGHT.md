# Migration Preflight — Live Supabase Verification

**Audit date:** 2026-11-24. **Project:** `Puzzle-Game` (`zrbvgtqspekxrnnzegwh`), region `eu-west-1`, status `ACTIVE_HEALTHY`. Inspection used Supabase MCP read-only catalog queries. No migration was applied.

## Repository inventory

The branch contains migrations `0001_foundation.sql` through `0011_content_studio.sql`. `supabase/tests/run_all.sh` drops and recreates its supplied database; it may only be used with a verified disposable scratch database.

## Verified live schema

- The live public schema contains the core game tables (profiles/roles, stories/questions/images/puzzle pieces, rooms/teams, game/card/score state, audit/event records). The catalog query reported RLS enabled on every public table returned (32 tables).
- `0009_users_reports.sql` functions `admin_list_users`, `admin_set_user_role`, and `admin_reports` exist with expected argument signatures.
- The six platform settings columns introduced by `0010_configurable_limits.sql` exist.
- The expected Content Studio tables from `0011_content_studio.sql` are absent from the public catalog: categories/tags, story metadata, assets/usages, import batches/items/errors, AI jobs/results, review history, versions, and `content_studio_settings`. The expected 0011 functions queried (`content_story_snapshot`, `save_story_content_metadata`, `set_story_review_status`, `attach_content_asset`, `create_ai_story_draft`, `start_ai_generation_job`, `import_content_story`) were absent.
- Existing Storage buckets are `story-originals` and `story-pieces`; both are private.
- Supabase MCP `list_migrations` returned an empty list; `information_schema` found no `supabase_migrations.schema_migrations` table; `list_branches` returned no development branches.

## Interpretation and risk

Catalog evidence indicates the live project has core gameplay and 0009/0010 objects, but **does not have Content Studio migration 0011 installed**. The migration history is not tracked/available through the connected project's migration registry, so the exact application chronology is unknown. Empty migration history is not proof that migrations were never run: catalog objects demonstrate otherwise for earlier migrations.

The target project is active and appears to be the live project; no staging branch is available. Migration 0011 adds tables, functions, RLS policies/triggers and default categories, and backfills editorial metadata for existing stories plus asset records/usages for existing images. It is not a read-only operation. No production data rows were queried; preserve all existing stories, images and related records if this migration is ever run. The local, not-yet-applied 0011 source was hardened for server-controlled import batch transitions.

## Decision / next safe actions

- Migration 0011 application status: **not applied according to present catalog evidence**.
- Migration chronology: **untracked/unknown**; do not rewrite or reset history.
- Production migration applied in this audit: **no**.
- The migration set and SQL suites passed on a sandbox-local PostgreSQL 16 scratch database (including import-state regression tests). This is not production/staging validation. No staging branch exists; reconcile history in any other environment and obtain explicit approval before applying any migration to the live project.
- Before any live application, verify all dependency functions/tables (including `has_permission`, `touch_updated_at`, `save_question`, `stories`, `story_images`, `platform_settings`, and `role_permissions`); the inspected required functions exist.
- Any subsequent fix to an already-applied migration must be delivered as a new forward migration.

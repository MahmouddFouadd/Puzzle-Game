# Dependency Decisions

**Audit date:** 2026-11-24. No dependencies or lockfile entries were changed during this audit.

## Checks

- Installed exactly from `package-lock.json` using `npm ci --no-audit --no-fund`.
- Ran `npm audit --omit=dev --json`: 9 dependency records flagged (1 critical, 1 high, 7 moderate).
- npm reports recommended remediation across major version boundaries, including `@capacitor/cli` 8.x and `react-router-dom` 7.x; blindly applying these could break the project's Capacitor 6 / React Router 6 stack.

## Findings / decision

| Package or chain | Finding | Decision |
|---|---|---|
| `tar` → `@capacitor/cli` | Critical and high advisories reported for the locked transitive `tar` version. CLI is a build/development tool, but Android CI invokes it (`npx cap sync android`). | Prioritize a compatibility investigation and CI/Android build; do not assert runtime exposure or ignore the release risk. |
| `react-router-dom` / `react-router` | Moderate advisories; proposed fix is major v7. | Review code/API compatibility and update only with route tests. |
| `exceljs` / `uuid` | Moderate advisory chain in the importer dependency. | Evaluate a maintained compatible parser or patched dependency path; retain XLSX behavior and test real sample files. |
| Transitive `glob`, `minimatch`, `rimraf` | Moderate records associated with CLI dependency chain. | Resolve through a compatible parent upgrade; do not hand-edit lockfile transitive versions without support. |
| Vite / TypeScript / React / Supabase JS | Build succeeded with current lockfile; no change was made. | Keep versions pinned by the committed lockfile pending broader compatibility/security review. |

## Next actions

1. Recheck current advisories at upgrade time; advisory data changes over time.
2. Inspect exact resolved versions (`npm ls`) and production/build reachability.
3. Prefer supported patched versions compatible with Capacitor 6 and existing Android Gradle configuration; schedule framework-major upgrades separately.
4. Preserve the lockfile; run unit tests, production build, importer fixture tests and Android APK workflow on the upgrade branch.

A successful build does not clear any security advisory.
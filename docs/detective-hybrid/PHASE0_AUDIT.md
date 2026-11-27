# Hybrid Detective Mode — Phase 0 Audit & Plan

Date: 2026-11-27 · Status: **audit only, no code changed** · Scope: evolve Detective Mode into a full investigation (Explore → Discover → Collect → Analyze → Interrogate → Connect → Deduce → Solve) without touching Story Puzzle, Bakasa, rooms or global scoring. Local Network stays paused.

## 1. What already exists (reuse, don't rebuild)

| Vision piece | Already in the repo | Where |
|---|---|---|
| Cases, versions, publish | `detective_cases`, `detective_case_versions`, `validate_detective_case`, `publish_detective_case` (staff-only RLS) | migrations 0012, 0014 |
| Scenes + hotspots | `detective_scenes`, `detective_evidence` (x/y/w/h %, `unlock_rule`), server-validated taps in `detective_inspect` (logs every tap in `detective_inspections`, returns only what was hit) | 0012, 0021 |
| Evidence inventory | `detective_discoveries` (unique per session+evidence → idempotent, no double points) + notebook UI | 0012, `DetectiveSession.tsx` |
| Stages + dependencies | `detective_stages.unlock_rule`, `detective_stage_unlocked`, `detective_current_stage` | 0012, 0021 |
| Suspects / statements | `detective_suspects`, `detective_statements` (truth status, conflicting evidence) | 0012 |
| Relationships board | `detective_evidence_relations` (answer key, staff only) + `detective_board_links` (player links incl. `UNCERTAIN`), `Board.tsx` | 0012, 0021 |
| Timeline | `detective_timeline_events` | 0012 |
| Questions | `detective_questions`, 12 types incl. `EVENT_ORDERING`, `SUSPECT_SELECTION`, `CONTRADICTION_IDENTIFICATION`, `EVIDENCE_RELATIONSHIP`, `FINAL_CONCLUSION`; options shuffled per session | 0012, 0021 |
| Hints + penalties | `detective_hints`, `detective_hint_uses` (one use per hint) | 0012, 0021 |
| Solution / verdict | `detective_solutions`, `detective_submissions`, `detective_report` (answer key only after finish) | 0012, 0026 |
| Scoring | `detective_score_events` + `detective_add_score`, points per question/evidence in case data (not global) | 0012, 0021 |
| Teams | `detective_parties` / `detective_party_members`, `detective_shared` (team = one shared progress), competitive mode = separate progress per player | 0026 |
| Admin | Detective Studio, case editor, **visual hotspot editor** (draw/move/resize) | `src/pages/admin/Detective*`, `HotspotEditor.tsx` |
| Case packs | `scripts/detective-pack-to-sql.mjs` (pack JSON + boxes JSON → idempotent draft SQL), 4 packs, `supabase/tests/detective_case_packs.sql` (4/4 pass, no answer leaks) | `supabase/seed/packs/` |

Security today: players never read case tables directly; everything goes through `security definer` RPCs that strip answer keys, hidden evidence and solutions. This must stay.

## 2. Real gaps

1. **Forensic lab**: no model for "request an examination → pending → result". 
2. **Interrogation / confrontation**: statements are static text; no "show evidence X to suspect Y → authored reaction / contradiction revealed".
3. **Board**: links are evidence↔evidence only; no suspect/event nodes, no hypothesis notes; feedback is immediate (prompt says it must not reveal correctness on link creation).
4. **Structured verdict**: final answer is a question; no suspect + motive + method + timeline + supporting evidence with partial credit.
5. **Guidance levels**: hints have penalty and order, but no level (objective/hint/guided), cooldown, max count or time trigger.
6. **Stage kinds**: stages are generic; no admin toggle per case for lab / interrogation / board / verdict.
7. **Team sync**: party/session screens poll every 4 s (no Realtime). Works, but slower than the prompt asks.
8. **Reports as documents**: evidence has text + image; no "forensic document" type with sample IDs, stamp, findings, limitations.
9. **Case-pack version**: packs have no `pack_version`; importer assumes today's shape.

## 3. Proposed design (backward compatible)

**Database (one new migration, additive only — no existing column or policy changed):**

- `detective_lab_procedures` (case version, evidence, exam type: DNA/BLOOD/FINGERPRINT/WEAPON/TOXICOLOGY/TIME_OF_DEATH/DIGITAL, requirements jsonb, result ar/en, release `INSTANT|DELAYED`, points). Staff-only RLS.
- `detective_lab_requests` (session, procedure, status `PENDING|READY`, created/released at; unique per session+procedure → idempotent).
- `detective_confrontations` (suspect, evidence, response ar/en, reveals contradiction, points) + `detective_confrontation_uses` (unique per session).
- `detective_board_links` gains nullable node kinds (suspect/event) and a note; correctness is only evaluated at verdict/report time.
- `detective_verdict_criteria` (per case: suspect key, motive options, method options, required evidence set, timeline order, weights) and `detective_verdicts` (one per session/team, partial score breakdown).
- `detective_hints` gains `level`, `cooldown_seconds`, `trigger_after_seconds`; `detective_cases.settings` jsonb for enabled stages, max hints, scoring values.
- New RPCs: `detective_lab_request`, `detective_confront`, `detective_submit_verdict`; `get_detective_session_payload` extended to return only lab results/confrontations the team has unlocked.
- Realtime: private channel `detective:<session>` (same pattern as voice migration 0028) broadcasting "progress changed" pings; clients refetch the payload, so no secrets travel over Realtime. Polling stays as fallback.

**Case pack v2:** add `"pack_version": 2` and optional sections `lab_procedures`, `confrontations`, `verdict`, `guidance`, `settings`. Packs without `pack_version` are v1 and import exactly as today. The validator gets the new checks (missing images, bad coordinates, duplicate keys, missing translations, unreachable required evidence, lab results for missing evidence, broken suspect refs, missing verdict criteria).

**UI:** Briefing → Scene explorer (pinch-zoom/pan, the image is the main surface) → Evidence drawer → Lab tab → Suspects/Interrogation tab → Board (+ timeline lane) → Verdict form → Resolution screen. Tabs appear only for stages the case enables. Same Friends Zone tokens, RTL/LTR.

## 4. Phases

| Phase | Deliverable | Risk to existing |
|---|---|---|
| 1 Foundation | migration 0029 (additive), pack v2 parser + validator, settings | none: v1 path unchanged, existing 4 cases re-tested |
| 2 Crime scene | zoom/pan viewer, discovery animation, evidence IDs, scene navigation | UI only |
| 3 Forensics | lab RPC + tab + report document card | new tables only |
| 4 Interrogation | confrontation RPC + room UI | new tables only |
| 5 Board | suspect/event nodes, notes, timeline lane, deferred correctness | extends board links |
| 6 Verdict | structured verdict + partial scoring + resolution screen | report RPC extended |
| 7 Admin builder | sections 1–15, validation panel, full preview | admin only |
| 8 Hardening | Realtime pings, team isolation + idempotency SQL tests, reconnect | — |

Content track, after Phase 1: **Case 01 "آخر ليلة في الغرفة 307" as the pilot** (cover, 4 scenes, 10–12 hotspots measured on the generated images, lab reports, 3 suspects, 9 questions, verdict). After you approve it, cases 02–05 at the same quality.

Every phase: SQL suite + `detective_case_packs.sql`, vitest, `tsc`, build, Story Puzzle/Bakasa regression, then one merge to main.

## 5. Not doing

No Local Network, no change to Story Puzzle scoring/defaults, no removal of the current Detective flow until the new one is verified, no AI API at runtime, no production data changes beyond publishing reviewed cases.

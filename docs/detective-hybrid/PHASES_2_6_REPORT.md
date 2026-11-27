# Hybrid Detective – Phases 2–6 report (Case 01 playable)

Date: 2026-11-27 · Case 01 is **not published in production** (awaiting approval).

## What players get (only in cases that enable it; the 4 classic cases are unchanged)

| Phase | Screen | Notes |
|---|---|---|
| 2 Crime scene | Existing zoom/pan viewer, tap-to-find, discovery card, scene progress | Lab list refreshes the moment a sample is found (bug found by the e2e test and fixed). Timeline events stay hidden until the evidence that establishes them is found (`timeline_events[].reveal_with`), so the timeline tab no longer gives the killer away. |
| 3 Forensic lab | 🧪 tab: one card per examination, "send to lab", locked-sample message, countdown for delayed results, fictional lab document (sample IDs, findings, limitations, stamp) | Results never shown before the request is ready (server). |
| 4 Interrogation | 🗣️ tab: suspect list → suspect file (relation, motive, alibi, statements) → interrogation room: choose a discovered clue, confront, authored reply; contradictions highlighted | Unauthored pairs get a neutral "no reaction". |
| 5 Board | Existing evidence board (links incl. "uncertain" hypotheses); correctness only in the report. Sequence reconstruction lives in the accusation. | Suspect/event nodes on the board are not built (see limitations). |
| 6 Accusation + resolution | ⚖️ tab: killer, motive, method, up to 6 clues, ordered sequence, explanation; draft saved on the device; one submission; resolution in the report: score /100, your answer vs the truth per part, key evidence hit/missed, lab tests missed, contradictions found, full real timeline | Grade and answers come only after the case is closed. |

Team play: live sync (Realtime "changed" pings on `detective:<session>`, no data inside; polling fallback 4 s, slow safety poll while live; reconnect with backoff). Status dot + 👑 for the captain. Only the captain submits the accusation and closes a case with an accusation stage; members prepare it and see "waiting for the captain".

## Server (migration 0030, additive)
`detective_topic_allowed` + RLS on `realtime.messages` (members only, receive only) · triggers that ping on discoveries, answers, board, lab, confrontations, accusation, progress · `detective_is_captain` · captain rule in `detective_submit_verdict` / `detective_finish` (v2 cases only) · `timeline_events.reveal_evidence` + payload filter · resolution adds the full timeline and suspect names.

## Tests run
| Check | Result |
|---|---|
| SQL suites (`run_all.sh`) | 134 ok, 0 FAIL |
| Detective SQL (`run_detective.sh`) | 5/5 case playthroughs PASS; hybrid 14 checks ok (incl. live-update topic, captain rule); Room 307 timeline + full playthrough PASS |
| Unit tests | 148/148 (new `hybrid.test.tsx` 5) |
| Typecheck / build | clean / OK |
| Phone e2e, Arabic, Pixel 7 (real SQL rules through a local RPC bridge) | 12/12 clues tapped in the UI, 9 lab requests, report opened, confrontation, accusation stored (grade hidden), case closed, resolution 100/100, 0 px overflow, 0 page errors |
| Phone e2e, English, 360 px | same, all passed |
| Two phones, cooperative party | member's discovery visible on the captain's phone after 2.3 s (polling; Realtime not available locally); lab request shared; member has no submit button; forged member accusation rejected (`captain_only`) |
| Offline / recovery | offline action shows "reconnecting", no crash; works again online; reload resumes the same investigation |
| Regression | 4 classic cases open with classic tabs only; Room 307 on a server without the new functions falls back to the classic flow without errors |

Screenshots: `screens/` (Arabic + English, phone).

## Limitations / not verified here
- **Android APK not run on a device or emulator** (no Android SDK/emulator in this environment). The APK is the same web build in a WebView; CI builds it on merge. Needs a real-device check before publishing.
- **Realtime not exercised end to end** (no Supabase Realtime locally): the ping triggers and RLS policy are guarded and the client falls back to polling, which was tested.
- **Production database**: migrations 0029/0030 are not applied yet; this session has no production database access any more. Until they are, Case 01 cannot be played in production (the app falls back to the classic flow).
- Board suspect/event nodes and a drag-to-order timeline on the board were not built; sequence ordering is part of the accusation.

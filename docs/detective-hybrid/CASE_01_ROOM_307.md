# Case 01 — آخر ليلة في الغرفة 307 – الإصدار 2 (The Last Night in Room 307 – Version 2)

Pilot case for the hybrid Detective mode. Fictional; restrained, non-graphic imagery; age 16+, ~30 min.
Pack: `supabase/seed/packs/room-307.json` (pack v2) → `supabase/seed/detective_room_307.sql` (DRAFT). Art: `public/demo/detective/room-307/` (preview: `room-307-preview.jpg`).

| | |
|---|---|
| Victim | عادل منصور، مالك فندق تاج النيل |
| Suspects | شريف كمال (المدير) · هدى سمير (مشرفة التدبير المنزلي) · طارق فهمي (الشريك) |
| Killer / motive | شريف كمال — يمنع كشف اختلاس 4.2 مليون بفواتير مورّد وهمي |
| Method | برمج كارت الماستر HK-02 من حسابه 23:52، قفل الكاميرا 00:05، دخل 00:12، طعنة بسكين مطبخ، رمى السكين في كيس عربة التدبير المنزلي مع جوانتي مقاس L |
| Misleading clue | السكين في كيس عربة هدى + جوانتي التدبير المنزلي |
| False statement | شريف: «مشيت 23:30 ومارجعتش» — يناقضها سجل الكروت والكاميرا وبقعة الجاكيت |
| Why the others are innocent | هدى: كارتها مكسور، سلّمت HK-02 وبصمت 23:04، الجوانتي مش مقاسها والـDNA يستبعدها. طارق: خرج 23:05 حسب الفاليه، بلا صلاحيات على الكاميرات أو الكروت |

**Content:** 4 scenes · 12 evidence hotspots (measured on the final images and checked with an overlay) · 9 lab procedures (blood ×3, DNA, fingerprint, camera audit, encoder log, medical examiner, ledgers; one delayed 30 s) · 9 authored confrontations (3 reveal contradictions) · 9 questions in 4 stages · 4 hints (levels 1–3) · 9-event timeline · structured accusation (suspect, 4 motives, 3 methods, key evidence, 4-event order).

Forensic wording never claims a single result proves guilt: lab results say "consistent with"/"excluded", list limitations, and the solution explains that the conclusion comes from independent records converging.

**Status:** imported and tested locally (`supabase/tests/detective_room_307.sql`: every clue, lab, confrontation and a perfect accusation = 100/100). Not published to production: the new lab/interrogation/accusation screens (Phases 2–6) must ship first, otherwise players would see only the classic flow.

**Images:** scene 1 via Canva AI; cover and scenes 2–4 via Figma AI (Canva credits ran out), exported through Canva at 1600×900.

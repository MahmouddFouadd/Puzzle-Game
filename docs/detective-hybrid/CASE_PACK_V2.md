# Detective case pack — version 2

Source of truth: `scripts/detective-pack-lib.mjs` (validator + normaliser) and `scripts/detective-pack-to-sql.mjs` (importer).

## Compatibility

- A pack **without** `pack_version` is v1 and imports exactly as before. Verified: the four existing packs produce byte-identical SQL after this change, and `src/detective/casePack.test.ts` checks that every v1 field survives normalisation.
- v2 = v1 + `"pack_version": 2` + the optional sections below. Nothing in v1 is renamed or removed.
- The importer now refuses a pack that fails validation (errors are printed, warnings don't block). Images are checked in `public/demo/detective/<folder>/` (`cover.webp`, `scene-N.webp`); set `SKIP_ASSET_CHECK=1` for fixtures.

```
node scripts/detective-pack-to-sql.mjs supabase/seed/packs/<name>.json <folder> supabase/seed/packs/<name>.boxes.json > supabase/seed/detective_<name>.sql
```

## New sections

```jsonc
{
  "pack_version": 2,
  "settings": {
    "stages": ["BRIEFING","CRIME_SCENE","EVIDENCE","LAB","INTERROGATION","BOARD","DEDUCTION","VERDICT","RESOLUTION"], // tabs the case uses
    "guidance": { "max_hints": 3, "cooldown_seconds": 60, "area_hints": true, "area_penalty": -3 }
  },
  "suspects": [{ "key": "manager", "...v1 fields": "", "motive_ar": "...", "alibi_ar": "...", "relationship_ar": "...", "portrait": "suspect-manager" }],
  "hints": [{ "stage": "scene", "position": 1, "level": 1, "penalty": -1, "hint_text_ar": "..." }],   // 1 objective · 2 hint · 3 guided
  "lab_procedures": [{
    "key": "blood-knife", "evidence": "knife", "exam_type": "BLOOD",            // DNA BLOOD FINGERPRINT WEAPON TOXICOLOGY TIME_OF_DEATH DIGITAL DOCUMENT OTHER
    "title_ar": "تحليل الدم على السكين", "requires": ["towel"],                  // other evidence that must be found first
    "result_ar": "...", "report": { "sample_ids": ["S-307-01"], "findings_ar": ["..."], "limitations_ar": "..." },
    "release_seconds": 0, "points": 15
  }],
  "confrontations": [{ "suspect": "manager", "evidence": "card", "response_ar": "...", "reveals_contradiction": true, "points": 20 }],
  "verdict": {
    "suspect": "manager",
    "motives": [{ "id": "fraud", "text_ar": "..." }], "motive": "fraud",
    "methods": [{ "id": "knife", "text_ar": "..." }], "method": "knife",
    "key_evidence": ["knife", "card"], "timeline": ["enter", "fight", "leave"],
    "weights": { "suspect": 40, "motive": 15, "method": 15, "evidence": 20, "timeline": 10 }   // optional
  }
}
```

## Runtime rules (migration `0029_detective_hybrid_foundation.sql`)

| Feature | Rule |
|---|---|
| Lab | Listed only once its sample is found; request needs `requires` found; one request per session (points once); `release_seconds` > 0 keeps it PENDING and hides the result until ready. |
| Interrogation | Only discovered evidence can be shown; an authored pair returns its response (points once); anything else returns "no reaction". |
| Verdict | One per team/session; only discovered evidence (max 6); the submit call returns no grade. Points are added at finish; answers appear only in `detective_resolution` after finishing. |
| Partial credit | suspect + motive + method + evidence (hits − ½ per wrong piece) + timeline (positions in place). The right suspect with no supporting evidence gets half the suspect points. |
| Hints | Text hints in level order, then a coarse area hint; `max_hints` and `cooldown_seconds` are enforced on the server. |
| Teams | Cooperative parties share all of the above; other players get `session_forbidden`. |

Tests: `supabase/tests/detective_hybrid.sql` (fixture `supabase/tests/fixtures/hybrid-mini.json`), run with `sh supabase/tests/run_all.sh t && sh supabase/tests/run_detective.sh t`.

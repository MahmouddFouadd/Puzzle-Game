/**
 * Detective case-pack format helpers shared by the importer (scripts/detective-pack-to-sql.mjs) and tests.
 *
 * Versions
 *  - v1 (no "pack_version"): case, stages, scenes[].evidence, suspects, statements, stages_questions, relations,
 *    hints, timeline_events, solution. Imported exactly as before.
 *  - v2 ("pack_version": 2): everything in v1, plus optional
 *      settings          { stages: [..enabled stage kinds], guidance: { max_hints, cooldown_seconds, area_hints, area_penalty } }
 *      lab_procedures    [{ key, evidence?, exam_type, title?, title_ar, requires?: [evidence keys], result?, result_ar,
 *                           report?: { sample_ids?, findings_ar?, limitations_ar?, ... }, release_seconds?, points?, position? }]
 *      confrontations    [{ suspect, evidence, response?, response_ar, reveals_contradiction?, points? }]
 *      verdict           { suspect, motives: [{id,text?,text_ar}], motive, methods: [...], method,
 *                          key_evidence: [evidence keys], timeline: [event_keys], weights? }
 *      suspects[].motive_ar / motive / alibi_ar / relationship_ar / portrait
 *      hints[].level (1 objective, 2 hint, 3 guided)
 *      timeline_events[].reveal_with (evidence key that reveals the event; hidden until found)
 */

export const STAGE_KINDS = ['BRIEFING', 'CRIME_SCENE', 'EVIDENCE', 'LAB', 'INTERROGATION', 'BOARD', 'DEDUCTION', 'VERDICT', 'RESOLUTION']
export const EXAM_TYPES = ['DNA', 'BLOOD', 'FINGERPRINT', 'WEAPON', 'TOXICOLOGY', 'TIME_OF_DEATH', 'DIGITAL', 'DOCUMENT', 'OTHER']
const CLASS = ['OBSERVATION', 'FACT', 'INFERENCE', 'PROBABILITY', 'ASSUMPTION']

export function packVersion(pack) {
  const v = pack?.pack_version
  if (v === undefined || v === null) return 1
  if (v === 1 || v === 2) return v
  throw new Error(`unsupported pack_version ${v}`)
}

/** Returns a v2-shaped pack (missing optional sections become empty) without changing any v1 field. */
export function normalizePack(pack) {
  const version = packVersion(pack)
  return {
    ...pack,
    pack_version: version,
    settings: version >= 2 ? (pack.settings ?? {}) : {},
    lab_procedures: version >= 2 ? (pack.lab_procedures ?? []) : [],
    confrontations: version >= 2 ? (pack.confrontations ?? []) : [],
    verdict: version >= 2 ? (pack.verdict ?? null) : null
  }
}

/** Structural validation. Returns { errors: string[], warnings: string[] }. */
export function validatePack(raw, { boxes = {}, assetExists } = {}) {
  const errors = [], warnings = []
  let pack
  try { pack = normalizePack(raw) } catch (e) { return { errors: [e.message], warnings } }
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m)
  const C = pack.case ?? {}
  if (!C.slug) err('case.slug missing')
  if (!C.title_ar) err('case.title_ar missing')
  if (!C.title) warn('case.title (English) missing – Arabic is used')
  if (!Array.isArray(pack.scenes) || !pack.scenes.length) err('no scenes')
  if (!Array.isArray(pack.stages) || !pack.stages.length) err('no stages')

  const stageKeys = new Set((pack.stages ?? []).map((s) => s.stage_key))
  const evidence = new Map()
  const positions = new Set()
  for (const sc of pack.scenes ?? []) {
    if (positions.has(sc.position)) err(`duplicate scene position ${sc.position}`)
    positions.add(sc.position)
    if (assetExists && !assetExists(`scene-${sc.position}`)) err(`scene ${sc.position} image missing`)
    for (const e of sc.evidence ?? []) {
      if (evidence.has(e.key)) err(`duplicate evidence key ${e.key}`)
      evidence.set(e.key, { ...e, scene: sc.position })
      const b = boxes[e.key] ?? e
      if (!['x', 'y', 'width', 'height'].every((k) => typeof b[k] === 'number')) err(`hotspot box missing for ${e.key}`)
      else if (b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x + b.width > 100.01 || b.y + b.height > 100.01) err(`hotspot out of range for ${e.key}`)
      if (!CLASS.includes(e.classification)) err(`evidence ${e.key} classification ${e.classification}`)
      if (!e.title_ar) err(`evidence ${e.key} title_ar missing`)
      if (!e.title) warn(`evidence ${e.key} English title missing`)
    }
  }
  if (assetExists && !assetExists('cover')) err('cover image missing')
  const hasEv = (k) => evidence.has(k)
  const suspects = new Set((pack.suspects ?? []).map((s) => s.key))
  const events = new Set((pack.timeline_events ?? []).map((t) => t.event_key))
  for (const t of pack.timeline_events ?? []) if (t.reveal_with && !evidence.has(t.reveal_with)) err(`timeline ${t.event_key}: reveal_with unknown evidence ${t.reveal_with}`)

  for (const r of pack.relations ?? []) if (!hasEv(r.from) || !hasEv(r.to)) err(`relation ${r.from}->${r.to} references unknown evidence`)
  for (const st of pack.statements ?? []) {
    if (!suspects.has(st.suspect)) err(`statement for unknown suspect ${st.suspect}`)
    for (const k of st.conflicting_evidence ?? []) if (!hasEv(k)) err(`statement references unknown evidence ${k}`)
  }
  const qs = pack.stages_questions ?? []
  if (qs.filter((q) => q.type === 'FINAL_CONCLUSION').length !== 1) err('exactly one FINAL_CONCLUSION question is required')
  for (const q of qs) {
    if (!stageKeys.has(q.stage)) err(`question ${q.stage}/${q.position} has unknown stage`)
    for (const k of q.associated_evidence ?? []) if (!hasEv(k)) err(`question ${q.stage}/${q.position} references unknown evidence ${k}`)
    if (!q.prompt_ar) err(`question ${q.stage}/${q.position} prompt_ar missing`)
    if (q.answer_key?.option_id && !(q.options ?? []).some((o) => o.id === q.answer_key.option_id)) err(`question ${q.stage}/${q.position} answer not in options`)
  }
  for (const h of pack.hints ?? []) {
    if (!stageKeys.has(h.stage)) err(`hint for unknown stage ${h.stage}`)
    if (h.level !== undefined && ![1, 2, 3].includes(h.level)) err(`hint level ${h.level} must be 1, 2 or 3`)
  }
  if (!pack.solution?.public_reveal_ar) err('solution.public_reveal_ar missing')

  // ---- v2 sections
  for (const k of pack.settings.stages ?? []) if (!STAGE_KINDS.includes(k)) err(`settings.stages: unknown stage kind ${k}`)
  const labKeys = new Set()
  for (const p of pack.lab_procedures) {
    if (labKeys.has(p.key)) err(`duplicate lab procedure ${p.key}`)
    labKeys.add(p.key)
    if (!EXAM_TYPES.includes(p.exam_type)) err(`lab ${p.key}: exam_type ${p.exam_type}`)
    if (p.evidence && !hasEv(p.evidence)) err(`lab ${p.key}: unknown evidence ${p.evidence}`)
    for (const k of p.requires ?? []) if (!hasEv(k)) err(`lab ${p.key}: requires unknown evidence ${k}`)
    if (!p.title_ar || !p.result_ar) err(`lab ${p.key}: title_ar/result_ar missing`)
  }
  const pairs = new Set()
  for (const c of pack.confrontations) {
    if (!suspects.has(c.suspect)) err(`confrontation: unknown suspect ${c.suspect}`)
    if (!hasEv(c.evidence)) err(`confrontation: unknown evidence ${c.evidence}`)
    const pk = `${c.suspect}|${c.evidence}`
    if (pairs.has(pk)) err(`duplicate confrontation ${pk}`)
    pairs.add(pk)
    if (!c.response_ar) err(`confrontation ${pk}: response_ar missing`)
  }
  const V = pack.verdict
  if (V) {
    if (!suspects.has(V.suspect)) err(`verdict: unknown suspect ${V.suspect}`)
    if (!(V.motives ?? []).some((o) => o.id === V.motive)) err('verdict: motive answer not in motives')
    if (!(V.methods ?? []).some((o) => o.id === V.method)) err('verdict: method answer not in methods')
    if (!(V.key_evidence ?? []).length) err('verdict: key_evidence is empty')
    for (const k of V.key_evidence ?? []) if (!hasEv(k)) err(`verdict: unknown evidence ${k}`)
    for (const t of V.timeline ?? []) if (!events.has(t)) err(`verdict: unknown timeline event ${t}`)
  } else if ((pack.settings.stages ?? []).includes('VERDICT')) err('settings enable VERDICT but no verdict criteria')
  if ((pack.settings.stages ?? []).includes('LAB') && !pack.lab_procedures.length) err('settings enable LAB but there are no lab procedures')
  if ((pack.settings.stages ?? []).includes('INTERROGATION') && !pack.confrontations.length) warn('INTERROGATION enabled without confrontations (statements only)')
  return { errors, warnings }
}

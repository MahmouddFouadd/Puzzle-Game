import { supabase } from '../lib/supabase'

export type DetectiveCase = {
  id: string; slug: string; title: string; title_ar: string; description: string | null; description_ar: string | null
  case_type: string; difficulty: number; age_min: number | null; age_max: number | null; status?: string
  category?: string; estimated_minutes?: number; cover_image_path?: string | null; briefing?: string | null; briefing_ar?: string | null
  objective?: string | null; objective_ar?: string | null; scenes?: number; stages?: number; evidence?: number; questions?: number
  best_score?: number | null; completed?: boolean; resume_session?: string | null
}
export type DetectiveEvidence = {
  id: string; evidence_key: string; public_title: string; public_title_ar: string; x: number; y: number; width: number; height: number
  zoom_image_path?: string | null; public_description?: string | null; public_description_ar?: string | null; classification: string; importance: number
}
export type DetectiveScene = {
  id: string; position: number; title: string; title_ar: string; image_path: string; introduction?: string | null; introduction_ar?: string | null
  evidence: DetectiveEvidence[]; evidence_total: number
}
export type DetectiveStage = { id: string; stage_key: string; position: number; title: string; title_ar: string; unlocked: boolean; current: boolean; questions_total: number }
export type DetectiveAnswered = { is_correct: boolean; points_delta: number; answer: Record<string, unknown>; correct_option?: string | null; explanation?: string | null; explanation_ar?: string | null }
export type DetectiveQuestion = {
  id: string; stage_id: string | null; question_type: string; prompt: string | null; prompt_ar: string | null
  options: Array<{ id: string; text: string; text_ar?: string }>; associated_evidence: string[]; points: number; penalty: number; position: number
  locked: boolean; answered: DetectiveAnswered | null
}
export type BoardLink = { from: string; to: string; relation: Relation }
export type Relation = 'SUPPORTS' | 'CONTRADICTS' | 'TEMPORAL' | 'CONTEXTUAL' | 'UNCERTAIN'
export type DetectiveSuspect = { id: string; name: string; name_ar: string; description?: string | null; description_ar?: string | null; relationship?: string | null; alibi?: string | null; statements: Array<{ id: string; statement: string; statement_ar: string }> }
export type DetectivePayload = {
  session: { id: string; mode: string; sharing: string; status: string; version_id: string }
  case: DetectiveCase
  stages: DetectiveStage[]; scenes: DetectiveScene[]; questions: DetectiveQuestion[]; suspects: DetectiveSuspect[]
  timeline: Array<{ id: string; event_key: string; label: string; label_ar: string; window_key?: string | null; position: number }>
  progress: { score: number; current_stage_id: string | null; started_at: string; completed_at: string | null } | null
  board: BoardLink[]; hints_used: Array<{ key: string; penalty: number; text?: string | null; text_ar?: string | null }>
  note: string | null; stats: { found: number; total: number; inspections: number }; server_now: string
  timeline_hidden?: number
  party?: { id: string; code: string; mode: 'COOPERATIVE' | 'COMPETITIVE'; status: string } | null
}
export type InspectResult = { found: boolean; warm?: boolean; locked?: boolean; already?: boolean; points?: number; score?: number; evidence?: DetectiveEvidence & { scene_id?: string } }
export type HintResult = { kind: 'text' | 'area'; text?: string; text_ar?: string; scene_id?: string; cx?: number; cy?: number; r?: number; penalty: number; score: number }
export type DetectiveReport = {
  case: { id: string; title: string; title_ar: string; estimated_minutes: number }
  score: number; duration_seconds: number; evidence_found: number; evidence_total: number; inspections: number; hits: number
  questions_total: number; questions_correct: number; hints_used: number; hint_penalty: number; breakdown: Record<string, number>; conclusion_correct: boolean | null
  questions: Array<{ prompt: string; prompt_ar: string; type: string; options: Array<{ id: string; text: string; text_ar?: string }>; answer_key: Record<string, unknown>; your_answer: Record<string, unknown> | null; is_correct: boolean | null; points: number | null; explanation: string | null; explanation_ar: string | null }>
  evidence: Array<{ id: string; title: string; title_ar: string; description: string | null; description_ar: string | null; explanation: string | null; explanation_ar?: string | null; classification: string; importance: number; found: boolean; scene_id: string; x: number; y: number; width: number; height: number }>
  scenes: Array<{ id: string; title: string; title_ar: string; image_path: string }>
  relations: Array<{ from: string; to: string; type: Relation; explanation: string | null; explanation_ar?: string | null; found_by_you: boolean }>
  your_links: Array<{ from: string; to: string; relation: Relation; correct: boolean }>
  statements: Array<{ suspect: string; suspect_ar: string; statement: string; statement_ar: string; truth: string; explanation: string | null; explanation_ar?: string | null; contradicted_by: string[] }>
  team?: Array<{ nickname: string; avatar: string; score: number; completed: boolean }>; party_mode?: 'COOPERATIVE' | 'COMPETITIVE' | null
  solution: { reveal: string; reveal_ar: string; explanation: string | null; explanation_ar: string | null; alternatives: Array<Record<string, string>> | null } | null
}
export type DetectiveHistoryRow = { session_id: string; case_id: string; title: string; title_ar: string; difficulty: number; started_at: string; completed_at: string | null; score: number; duration_seconds: number | null; found: number; total: number }

function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('No data returned')
  return result.data
}

export async function listDetectiveCases(): Promise<DetectiveCase[]> {
  return must(await supabase.rpc('get_detective_case_catalog')) as DetectiveCase[]
}

export async function listAdminDetectiveCases(): Promise<DetectiveCase[]> {
  return must(await supabase.from('detective_cases').select('id,slug,title,title_ar,description,description_ar,case_type,difficulty,age_min,age_max,status').order('updated_at', { ascending: false }).limit(100)) as DetectiveCase[]
}

export async function getAdminCase(caseId: string) {
  const [c, versions] = await Promise.all([
    supabase.from('detective_cases').select('id,slug,title,title_ar,description,description_ar,case_type,difficulty,age_min,age_max,status').eq('id', caseId).single(),
    supabase.from('detective_case_versions').select('id,version_number,status,created_at,published_at').eq('case_id', caseId).order('version_number', { ascending: false }).limit(20)
  ])
  if (c.error) throw new Error(c.error.message)
  if (versions.error) throw new Error(versions.error.message)
  return { case: c.data as DetectiveCase, versions: versions.data ?? [] }
}

export async function createDetectiveCase(title: string, titleAr: string, userId: string): Promise<string> {
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)}-${Date.now().toString(36)}`
  const inserted = await supabase.from('detective_cases').insert({ slug, title, title_ar: titleAr, status: 'DRAFT', created_by: userId }).select('id').single()
  if (inserted.error) throw new Error(inserted.error.message)
  const version = await supabase.from('detective_case_versions').insert({ case_id: inserted.data.id, version_number: 1, status: 'DRAFT', created_by: userId }).select('id').single()
  if (version.error) throw new Error(version.error.message)
  return inserted.data.id
}

export async function publishDetectiveCase(caseId: string): Promise<void> {
  const result = await supabase.rpc('publish_detective_case', { p_case: caseId })
  if (result.error) throw new Error(result.error.message)
}

export async function loadDetectiveSession(sessionId: string): Promise<DetectivePayload> {
  return must(await supabase.rpc('get_detective_session_payload', { p_session: sessionId })) as DetectivePayload
}

export async function startDetectiveSession(caseId: string): Promise<string> {
  // Resumes an unfinished solo session on the server instead of creating a duplicate.
  const result = must(await supabase.rpc('start_detective_session', { p_case: caseId, p_mode: 'SOLO' })) as { session_id: string }
  return result.session_id
}

export async function inspectScene(sessionId: string, sceneId: string, x: number, y: number): Promise<InspectResult> {
  return must(await supabase.rpc('detective_inspect', { p_session: sessionId, p_scene: sceneId, p_x: Math.round(x * 100) / 100, p_y: Math.round(y * 100) / 100 })) as InspectResult
}
export async function requestDetectiveHint(sessionId: string): Promise<HintResult> {
  return must(await supabase.rpc('detective_use_hint', { p_session: sessionId })) as HintResult
}
export async function boardLink(sessionId: string, from: string, to: string, relation: Relation, remove = false): Promise<void> {
  const r = await supabase.rpc('detective_board_link', { p_session: sessionId, p_from: from, p_to: to, p_relation: relation, p_remove: remove })
  if (r.error) throw new Error(r.error.message)
}
export async function saveDetectiveNote(sessionId: string, body: string): Promise<void> {
  const r = await supabase.rpc('detective_save_note', { p_session: sessionId, p_body: body })
  if (r.error) throw new Error(r.error.message)
}
export async function finishDetective(sessionId: string): Promise<DetectiveReport> {
  return must(await supabase.rpc('detective_finish', { p_session: sessionId })) as DetectiveReport
}
export async function detectiveReport(sessionId: string): Promise<DetectiveReport> {
  return must(await supabase.rpc('detective_report', { p_session: sessionId })) as DetectiveReport
}
export async function detectiveHistory(): Promise<DetectiveHistoryRow[]> {
  return must(await supabase.rpc('detective_my_history')) as DetectiveHistoryRow[]
}

/** Arabic/English text for a server error code. */
export function detectiveError(e: unknown, ar: boolean): string {
  const m = e instanceof Error ? e.message : String(e)
  const t: Record<string, [string, string]> = {
    slow_down: ['استنى ثانية… بتفحص بسرعة جدًا.', 'Slow down a little – too many taps.'],
    stage_locked: ['المرحلة دي لسه مقفولة. خلّص أسئلة المرحلة اللي قبلها.', 'This stage is locked. Finish the previous stage first.'],
    conclusion_required: ['لازم تقدّم استنتاجك النهائي الأول.', 'Submit your final conclusion first.'],
    no_hints: ['مفيش تلميحات تانية متاحة دلوقتي.', 'No more hints available right now.'],
    evidence_not_discovered: ['اربط بس الأدلة اللي اكتشفتها.', 'You can only link evidence you have discovered.'],
    session_forbidden: ['الجلسة دي مش بتاعتك.', 'This session is not yours.'],
    session_not_playing: ['التحقيق ده انتهى.', 'This investigation has ended.'],
    already_completed: ['انت خلّصت التحقيق ده خلاص.', 'You already completed this investigation.'],
    case_not_published: ['القضية دي مش متاحة حاليًا.', 'This case is not available.'],
    too_many_links: ['وصلت للحد الأقصى من الروابط.', 'Link limit reached.'],
    not_completed: ['التقرير يظهر بعد ما تخلّص التحقيق.', 'The report is available after you finish.'],
    not_enough_players: ['محتاجين محققين اتنين على الأقل.', 'At least two detectives are needed.'],
    players_not_ready: ['فيه محققين لسه مش جاهزين.', 'Some detectives are not ready.'],
    already_started: ['التحقيق بدأ بالفعل.', 'The investigation already started.'],
    invalid_nickname: ['اكتب اسم من 1 لـ 30 حرف.', 'Enter a name of 1–30 characters.'],
    sample_missing: ['لازم تلاقي العينة الأول في مسرح الجريمة.', 'Find the sample at the crime scene first.'],
    evidence_not_found: ['استخدم بس الأدلة اللي لقيتها.', 'Use only evidence you have found.'],
    hint_cooldown: ['استنى شوية قبل التلميح الجاي.', 'Wait a little before the next hint.'],
    hint_limit: ['استخدمت كل التلميحات المتاحة للقضية دي.', 'You have used every hint for this case.'],
    verdict_required: ['لازم تقدّم الاتهام النهائي الأول.', 'Submit your final accusation first.'],
    verdict_already_submitted: ['الاتهام اتقدّم خلاص.', 'The accusation was already submitted.'],
    too_much_evidence: ['اختار 6 أدلة بحد أقصى.', 'Choose at most 6 pieces of evidence.'],
    captain_only: ['القرار ده لقائد الفريق بس.', 'Only the team captain can do this.'],
    too_many_events: ['اختار أحداث أقل للتسلسل.', 'Choose fewer events for the sequence.'],
    procedure_not_found: ['الفحص ده مش متاح.', 'This examination is not available.'],
    suspect_not_found: ['اختار مشتبه به من القضية.', 'Choose a suspect from the case.']
  }
  for (const [code, [a, en]] of Object.entries(t)) if (m.includes(code)) return ar ? a : en
  if (/fetch|network/i.test(m)) return ar ? 'الاتصال انقطع… بنحاول نرجعك للتحقيق.' : 'Connection lost… trying to reconnect.'
  return ar ? 'حصلت مشكلة غير متوقعة. جرّب تاني.' : 'Something went wrong. Please try again.'
}

export async function submitDetectiveAnswer(sessionId: string, questionId: string, answer: Record<string, unknown>) {
  return must(await supabase.rpc('submit_detective_answer', { p_session: sessionId, p_question: questionId, p_answer: answer, p_idempotency_key: crypto.randomUUID() })) as {
    is_correct: boolean; points_delta: number; score?: number; explanation?: string | null; explanation_ar?: string | null; duplicate?: boolean
  }
}

// ---------- group play ----------
export type PartyMode = 'COOPERATIVE' | 'COMPETITIVE'
export type PartyMember = { user_id: string; nickname: string; avatar: string; is_ready: boolean; status: string; score: number | null; completed_at: string | null; found: number; answered: number; correct: number }
export type PartyState = {
  me: string; server_now: string
  party: { id: string; code: string; mode: PartyMode; status: 'LOBBY' | 'PLAYING' | 'FINISHED' | 'CLOSED'; host_id: string; started_at: string | null; updated_at: string }
  case: { id: string; title: string; title_ar: string; cover_image_path: string | null; difficulty: number; estimated_minutes: number; description: string | null; description_ar: string | null }
  evidence_total: number; questions_total: number; my_session: string | null; members: PartyMember[]
}
export async function createParty(caseId: string, mode: PartyMode, nickname: string, avatar: string) {
  return must(await supabase.rpc('detective_party_create', { p_case: caseId, p_mode: mode, p_nickname: nickname, p_avatar: avatar })) as { party_id: string; code: string }
}
export async function joinParty(code: string, nickname: string, avatar: string) {
  return must(await supabase.rpc('detective_party_join', { p_code: code, p_nickname: nickname, p_avatar: avatar })) as { status: string; party_id?: string }
}
export async function partyState(partyId: string) { return must(await supabase.rpc('detective_party_state', { p_party: partyId })) as PartyState }
export async function partyReady(partyId: string, ready: boolean) { const r = await supabase.rpc('detective_party_ready', { p_party: partyId, p_ready: ready }); if (r.error) throw new Error(r.error.message) }
export async function partyStart(partyId: string) { const r = await supabase.rpc('detective_party_start', { p_party: partyId }); if (r.error) throw new Error(r.error.message) }
export async function partyLeave(partyId: string) { const r = await supabase.rpc('detective_party_leave', { p_party: partyId }); if (r.error) throw new Error(r.error.message) }

// ---------- Hybrid investigation (migration 0029) ----------
export type StageKind = 'BRIEFING' | 'CRIME_SCENE' | 'EVIDENCE' | 'LAB' | 'INTERROGATION' | 'BOARD' | 'DEDUCTION' | 'VERDICT' | 'RESOLUTION'
export type LabProcedure = {
  id: string; key: string; exam_type: string; title: string; title_ar: string; evidence_id: string | null; available: boolean
  status: 'PENDING' | 'READY' | null; ready_at: string | null; result: string | null; result_ar: string | null; report: Record<string, unknown> | null
}
export type VerdictOption = { id: string; text: string; text_ar: string }
export type Investigation = {
  settings: { stages: StageKind[]; guidance: { max_hints?: number; cooldown_seconds?: number; area_hints?: boolean } }
  captain: boolean
  lab: LabProcedure[]
  suspects: Array<{ id: string; portrait_path: string | null; motive: string | null; motive_ar: string | null; alibi_ar: string | null; relationship_ar: string | null; background: string | null }>
  confrontations: Array<{ suspect_id: string; evidence_id: string; response: string; response_ar: string; reveals_contradiction: boolean }>
  verdict: { enabled: boolean; motive_options: VerdictOption[]; method_options: VerdictOption[]; evidence_max: number; timeline_events: number
    submitted: { suspect_id: string; motive: string; method: string; evidence: string[]; timeline: string[]; explanation: string | null } | null } | null
  hints: { used: number; max: number | null; cooldown_seconds: number; last_used_at: string | null }
  server_now: string
}
export type VerdictInput = { suspect: string; motive: string; method: string; evidence: string[]; timeline: string[]; explanation?: string }
export type Resolution = {
  verdict: null | {
    correct: { suspect_id: string; motive: string; method: string; key_evidence: string[]; timeline: string[]; motive_options: VerdictOption[]; method_options: VerdictOption[] }
    yours: { suspect_id: string; motive: string; method: string; evidence: string[]; timeline: string[]; explanation: string | null } | null
    breakdown: { suspect: number; motive: number; method: number; evidence: number; timeline: number; total: number; max: number } | null; points: number | null
  }
  lab: Array<{ key: string; title: string; title_ar: string; exam_type: string; requested: boolean; result: string; result_ar: string; report: Record<string, unknown> }>
  confrontations: { total: number; used: number; contradictions_total: number; contradictions_found: number }
  timeline: Array<{ event_key: string; label: string; label_ar: string; window_key: string | null }>
  suspects: Array<{ id: string; name: string; name_ar: string }>
}

export async function loadInvestigation(sessionId: string) { return must(await supabase.rpc('get_detective_investigation', { p_session: sessionId })) as Investigation }
export async function requestLab(sessionId: string, procedureId: string) {
  return must(await supabase.rpc('detective_lab_request', { p_session: sessionId, p_procedure: procedureId })) as { status: 'PENDING' | 'READY'; ready_at: string; already: boolean; score?: number }
}
export async function confrontSuspect(sessionId: string, suspectId: string, evidenceId: string) {
  return must(await supabase.rpc('detective_confront', { p_session: sessionId, p_suspect: suspectId, p_evidence: evidenceId })) as
    { matched: boolean; response?: string; response_ar?: string; reveals_contradiction?: boolean; already?: boolean; score?: number }
}
export async function submitVerdict(sessionId: string, v: VerdictInput) {
  return must(await supabase.rpc('detective_submit_verdict', { p_session: sessionId, p_suspect: v.suspect, p_motive: v.motive, p_method: v.method,
    p_evidence: v.evidence, p_timeline: v.timeline, p_explanation: v.explanation ?? null })) as { submitted: true }
}
export async function loadResolution(sessionId: string) { return must(await supabase.rpc('detective_resolution', { p_session: sessionId })) as Resolution }

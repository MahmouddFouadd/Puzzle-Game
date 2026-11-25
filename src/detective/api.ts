import { supabase } from '../lib/supabase'

export type DetectiveCase = {
  id: string; slug: string; title: string; title_ar: string; description: string | null; description_ar: string | null
  case_type: string; difficulty: number; age_min: number | null; age_max: number | null; status?: string
}
export type DetectiveEvidence = {
  id: string; evidence_key: string; public_title: string; public_title_ar: string; x: number; y: number; width: number; height: number
  zoom_image_path?: string | null; public_description?: string | null; public_description_ar?: string | null; classification: string; importance: number
}
export type DetectiveScene = {
  id: string; position: number; title: string; title_ar: string; image_path: string; introduction?: string | null; introduction_ar?: string | null; evidence: DetectiveEvidence[]
}
export type DetectiveStage = { id: string; stage_key: string; position: number; title: string; title_ar: string }
export type DetectiveQuestion = { id: string; stage_id: string | null; question_type: string; prompt: string; prompt_ar: string; options: Array<{ id: string; text: string }>; associated_evidence: string[]; points: number; penalty: number; position: number }
export type DetectiveSuspect = { id: string; name: string; name_ar: string; description?: string | null; description_ar?: string | null; relationship?: string | null; alibi?: string | null; statements: Array<{ id: string; statement: string; statement_ar: string }> }
export type DetectivePayload = {
  session: { id: string; mode: string; sharing: string; status: string; version_id: string }
  case: DetectiveCase
  stages: DetectiveStage[]; scenes: DetectiveScene[]; questions: DetectiveQuestion[]; suspects: DetectiveSuspect[]
  timeline: Array<{ id: string; event_key: string; label: string; label_ar: string; window_key?: string | null; position: number }>
  progress: { score: number; current_stage_id: string | null; completed_at: string | null } | null
}

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
  const result = must(await supabase.rpc('start_detective_session', { p_case: caseId, p_mode: 'SOLO' })) as { session_id: string }
  return result.session_id
}

export async function discoverEvidence(sessionId: string, evidenceId: string): Promise<void> {
  const key = crypto.randomUUID()
  must(await supabase.rpc('discover_detective_evidence', { p_session: sessionId, p_evidence: evidenceId, p_key: key }))
}

export async function submitDetectiveAnswer(sessionId: string, questionId: string, answer: Record<string, unknown>) {
  return must(await supabase.rpc('submit_detective_answer', { p_session: sessionId, p_question: questionId, p_answer: answer, p_idempotency_key: crypto.randomUUID() })) as {
    is_correct: boolean; points_delta: number; score?: number; explanation?: string | null; explanation_ar?: string | null; duplicate?: boolean
  }
}

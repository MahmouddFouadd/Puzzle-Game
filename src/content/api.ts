import { supabase } from '../lib/supabase'
import { resolveImageUrl } from '../storage/imageUrl'

export type ReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
export type ContentSource = 'MANUAL' | 'AI' | 'IMPORT'

export interface ContentCategory {
  id: string
  parent_id: string | null
  slug: string
  name_en: string
  name_ar: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface StoryContentMetadata {
  story_id: string
  language: 'ar' | 'en'
  age_min: number | null
  age_max: number | null
  subject_id: string | null
  difficulty: number
  source_type: ContentSource
  source_reference: string | null
  license_type: string
  attribution: string | null
  review_status: ReviewStatus
  author_id: string | null
  reviewer_id: string | null
  approved_at: string | null
  editorial_notes: string | null
  updated_at: string
}

export interface ContentStory {
  id: string
  title: string
  description: string | null
  category: string | null
  subject: string | null
  difficulty: number
  language: 'ar' | 'en'
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  created_at: string
  updated_at: string
  metadata: StoryContentMetadata
  categoryInfo: Pick<ContentCategory, 'name_en' | 'name_ar' | 'slug'> | null
}

export interface ContentAsset {
  id: string
  storage_path: string
  original_filename: string
  mime_type: string
  width: number
  height: number
  file_size: number | null
  sha256: string | null
  source_type: 'UPLOAD' | 'AI' | 'IMPORT' | 'LEGACY'
  source_provider: string | null
  license_type: string
  attribution: string | null
  generation_prompt: string | null
  created_at: string
  usageCount: number
}

export interface ContentFilters {
  search?: string
  reviewStatus?: ReviewStatus | 'ALL'
  gameplayStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'ALL'
  subjectId?: string
  ageMin?: number
  ageMax?: number
  difficulty?: number
  sourceType?: ContentSource | 'ALL'
  page?: number
  pageSize?: number
}

export interface AssetUploadResult { asset: ContentAsset; duplicate: boolean }

function ensure<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('empty_response')
  return data
}

export async function listCategories(activeOnly = false): Promise<ContentCategory[]> {
  let query = supabase.from('content_categories').select('*').order('sort_order').order('name_en')
  if (activeOnly) query = query.eq('is_active', true)
  const result = await query
  return ensure(result.data, result.error) as ContentCategory[]
}

export async function saveCategory(input: Pick<ContentCategory, 'slug' | 'name_en' | 'name_ar'> & Partial<Pick<ContentCategory, 'id' | 'parent_id' | 'description' | 'sort_order' | 'is_active'>>): Promise<void> {
  const payload = {
    slug: input.slug.trim().toLowerCase(), name_en: input.name_en.trim(), name_ar: input.name_ar.trim(),
    parent_id: input.parent_id ?? null, description: input.description ?? null,
    sort_order: input.sort_order ?? 0, is_active: input.is_active ?? true
  }
  const result = input.id
    ? await supabase.from('content_categories').update(payload).eq('id', input.id)
    : await supabase.from('content_categories').insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id })
  if (result.error) throw new Error(result.error.message)
}

export async function listContentStories(filters: ContentFilters = {}): Promise<{ rows: ContentStory[]; total: number }> {
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
  const page = Math.max(0, filters.page ?? 0)
  let query = supabase.from('stories').select(
    'id,title,description,category,subject,difficulty,language,status,created_at,updated_at,metadata:story_content_metadata!inner(story_id,language,age_min,age_max,subject_id,difficulty,source_type,source_reference,license_type,attribution,review_status,author_id,reviewer_id,approved_at,editorial_notes,updated_at,categoryInfo:content_categories(name_en,name_ar,slug))',
    { count: 'exact' }
  )
  const term = filters.search?.trim()
  if (term) query = query.ilike('title', `%${term.replace(/[%_]/g, '\\$&')}%`)
  if (filters.gameplayStatus && filters.gameplayStatus !== 'ALL') query = query.eq('status', filters.gameplayStatus)
  if (filters.reviewStatus && filters.reviewStatus !== 'ALL') query = query.eq('story_content_metadata.review_status', filters.reviewStatus)
  if (filters.subjectId) query = query.eq('story_content_metadata.subject_id', filters.subjectId)
  if (filters.difficulty) query = query.eq('story_content_metadata.difficulty', filters.difficulty)
  if (filters.sourceType && filters.sourceType !== 'ALL') query = query.eq('story_content_metadata.source_type', filters.sourceType)
  if (filters.ageMin !== undefined) query = query.lte('story_content_metadata.age_min', filters.ageMin)
  if (filters.ageMax !== undefined) query = query.gte('story_content_metadata.age_max', filters.ageMax)
  const result = await query.order('updated_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1)
  const data = ensure(result.data, result.error) as unknown as Array<Record<string, unknown>>
  const rows = data.map((row) => {
    const m = (Array.isArray(row.metadata) ? row.metadata[0] : row.metadata) as Record<string, unknown> | null
    const categoryInfo = m?.categoryInfo as ContentStory['categoryInfo'] | null | undefined
    return { ...row, metadata: m, categoryInfo: categoryInfo ?? null } as unknown as ContentStory
  })
  return { rows, total: result.count ?? 0 }
}

export async function saveStoryMetadata(storyId: string, metadata: {
  language: 'ar' | 'en'; age_min: number | null; age_max: number | null; subject_id: string | null;
  difficulty: number; source_type: ContentSource; source_reference: string | null;
  license_type: string; attribution: string | null; editorial_notes: string | null
}, tags: string[]): Promise<void> {
  const { error } = await supabase.rpc('save_story_content_metadata', { p_story: storyId, p: metadata, p_tags: tags })
  if (error) throw new Error(error.message)
}

export async function setReviewStatus(storyId: string, status: ReviewStatus, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('set_story_review_status', { p_story: storyId, p_status: status, p_reason: reason ?? null })
  if (error) throw new Error(error.message)
}

export async function getReviewHistory(storyId: string): Promise<Array<{ id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string }>> {
  const result = await supabase.from('content_review_history').select('id,from_status,to_status,reason,created_at').eq('story_id', storyId).order('created_at', { ascending: false })
  return ensure(result.data, result.error) as Array<{ id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string }>
}

export async function listAssets(options: { search?: string; unusedOnly?: boolean; page?: number; pageSize?: number } = {}): Promise<{ rows: ContentAsset[]; total: number }> {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 24))
  const page = Math.max(0, options.page ?? 0)
  let query = supabase.from('content_assets').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (options.search?.trim()) query = query.ilike('original_filename', `%${options.search.trim()}%`)
  const result = await query.range(page * pageSize, page * pageSize + pageSize - 1)
  const assets = ensure(result.data, result.error) as Omit<ContentAsset, 'usageCount'>[]
  const ids = assets.map((a) => a.id)
  let usage: Array<{ asset_id: string }> = []
  if (ids.length) {
    const relation = await supabase.from('content_asset_usages').select('asset_id').in('asset_id', ids)
    usage = ensure(relation.data, relation.error) as Array<{ asset_id: string }>
  }
  const counts = usage.reduce<Record<string, number>>((acc, row) => { acc[row.asset_id] = (acc[row.asset_id] ?? 0) + 1; return acc }, {})
  const rows = assets.map((asset) => ({ ...asset, usageCount: counts[asset.id] ?? 0 }))
  return { rows: options.unusedOnly ? rows.filter((a) => a.usageCount === 0) : rows, total: options.unusedOnly ? rows.filter((a) => a.usageCount === 0).length : result.count ?? 0 }
}

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_ASSET_BYTES = 15 * 1024 * 1024

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function uploadContentAsset(file: File, details: { license_type: string; attribution?: string; source_type?: ContentAsset['source_type'] }): Promise<AssetUploadResult> {
  const ext = IMAGE_EXTENSIONS[file.type]
  if (!ext) throw new Error('unsupported_type')
  if (file.size > MAX_ASSET_BYTES) throw new Error('file_too_large')
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()
  const sha256 = await fileSha256(file)
  const dupe = await supabase.from('content_assets').select('*').eq('sha256', sha256).maybeSingle()
  if (dupe.error) throw new Error(dupe.error.message)
  if (dupe.data) return { asset: { ...(dupe.data as Omit<ContentAsset, 'usageCount'>), usageCount: 0 }, duplicate: true }

  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('not_authenticated')
  const path = `content-library/${sha256.slice(0, 2)}/${sha256}.${ext}`
  // The path is derived from the verified file bytes; upsert makes retries recover
  // from an orphan left by a transient database insert failure without duplicating it.
  const upload = await supabase.storage.from('story-originals').upload(path, file, { contentType: file.type, upsert: true })
  if (upload.error) throw new Error(upload.error.message)
  const inserted = await supabase.from('content_assets').insert({
    storage_path: path, original_filename: file.name.slice(0, 255), mime_type: file.type,
    width, height, file_size: file.size, sha256, source_type: details.source_type ?? 'UPLOAD',
    license_type: details.license_type.trim() || 'UNKNOWN', attribution: details.attribution?.trim() || null,
    created_by: user.id
  }).select('*').single()
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const retry = await supabase.from('content_assets').select('*').eq('sha256', sha256).maybeSingle()
      if (retry.data) return { asset: { ...(retry.data as Omit<ContentAsset, 'usageCount'>), usageCount: 0 }, duplicate: true }
    }
    // Keep the content-addressed object on uncertain DB failures: another concurrent upload
    // may already reference the same hash path, so deleting it here could break a valid asset.
    throw new Error(inserted.error.message)
  }
  return { asset: { ...(inserted.data as Omit<ContentAsset, 'usageCount'>), usageCount: 0 }, duplicate: false }
}

export async function assetPreviewUrl(path: string): Promise<string> {
  return resolveImageUrl(path, 'story-originals', 600)
}

export async function attachAssetToStory(storyId: string, assetId: string, title?: string): Promise<string> {
  const { data, error } = await supabase.rpc('attach_content_asset', { p_story: storyId, p_asset: assetId, p_title: title ?? null })
  if (error) throw new Error(error.message)
  return data as string
}

export async function contentAnalytics(): Promise<{ stories: number; drafts: number; review: number; approved: number; published: number; questions: number; assets: number; unusedAssets: number; failedImports: number; aiFailed: number }> {
  const [stories, drafts, review, approved, published, questions, assets, usages, failedImports, aiFailed] = await Promise.all([
    supabase.from('stories').select('id', { count: 'exact', head: true }),
    supabase.from('story_content_metadata').select('story_id', { count: 'exact', head: true }).eq('review_status', 'DRAFT'),
    supabase.from('story_content_metadata').select('story_id', { count: 'exact', head: true }).eq('review_status', 'IN_REVIEW'),
    supabase.from('story_content_metadata').select('story_id', { count: 'exact', head: true }).eq('review_status', 'APPROVED'),
    supabase.from('stories').select('id', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
    supabase.from('questions').select('id', { count: 'exact', head: true }),
    supabase.from('content_assets').select('id', { count: 'exact', head: true }),
    supabase.from('content_asset_usages').select('asset_id'),
    supabase.from('content_import_batches').select('id', { count: 'exact', head: true }).in('status', ['PARTIAL', 'FAILED']),
    supabase.from('ai_generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'FAILED')
  ])
  for (const r of [stories, drafts, review, approved, published, questions, assets, usages, failedImports, aiFailed]) if (r.error) throw new Error(r.error.message)
  const used = new Set((usages.data as Array<{ asset_id: string }> | null ?? []).map((row) => row.asset_id)).size
  return {
    stories: stories.count ?? 0, drafts: drafts.count ?? 0, review: review.count ?? 0,
    approved: approved.count ?? 0, published: published.count ?? 0, questions: questions.count ?? 0,
    assets: assets.count ?? 0, unusedAssets: Math.max(0, (assets.count ?? 0) - used),
    failedImports: failedImports.count ?? 0, aiFailed: aiFailed.count ?? 0
  }
}

export async function listQuestionBank(options: { search?: string; type?: string; page?: number; pageSize?: number } = {}): Promise<{ rows: Array<{ id: string; text: string; type: string; published: boolean; story_id: string; story_title: string }>; total: number }> {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25))
  const page = Math.max(0, options.page ?? 0)
  let query = supabase.from('questions').select('id,text,type,published,story_id,story:stories!inner(title)', { count: 'exact' })
  if (options.search?.trim()) query = query.ilike('text', `%${options.search.trim()}%`)
  if (options.type && options.type !== 'ALL') query = query.eq('type', options.type)
  const result = await query.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1)
  const data = ensure(result.data, result.error) as unknown as Array<Record<string, unknown>>
  return {
    rows: data.map((row) => {
      const joined = row.story as { title: string } | { title: string }[]
      const story = Array.isArray(joined) ? joined[0] : joined
      return { ...row, story_title: story?.title ?? '' } as unknown as { id: string; text: string; type: string; published: boolean; story_id: string; story_title: string }
    }),
    total: result.count ?? 0
  }
}

export async function listImportBatches(): Promise<Array<{ id: string; filename: string; status: string; total_rows: number; valid_rows: number; imported_rows: number; error_rows: number; created_at: string }>> {
  const result = await supabase.from('content_import_batches').select('id,filename,status,total_rows,valid_rows,imported_rows,error_rows,created_at').order('created_at', { ascending: false }).limit(25)
  return ensure(result.data, result.error) as Array<{ id: string; filename: string; status: string; total_rows: number; valid_rows: number; imported_rows: number; error_rows: number; created_at: string }>
}

export async function getImportStoryLimit(): Promise<number> {
  const { data, error } = await supabase.from('content_studio_settings').select('max_stories_per_import').eq('id', true).single()
  if (error || !data) throw new Error(error?.message ?? 'content_settings_missing')
  return data.max_stories_per_import
}

export async function createImportBatch(input: { filename: string; total_rows: number; valid_rows: number; dry_run: boolean }): Promise<string> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('not_authenticated')
  const { data, error } = await supabase.from('content_import_batches').insert({
    ...input, uploaded_by: auth.user.id, status: 'VALIDATING', imported_rows: 0, error_rows: 0, finished_at: null
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'import_batch_create_failed')
  return data.id
}

export async function recordImportErrors(batchId: string, errors: Array<{ sheet: string; row: number; field?: string; code: string; message: string }>): Promise<void> {
  if (!errors.length) return
  const { error } = await supabase.from('content_import_errors').upsert(errors.map((item) => ({
    batch_id: batchId, sheet_name: item.sheet.slice(0, 80), row_number: Math.max(1, item.row),
    field_name: item.field?.slice(0, 80) || '', error_code: item.code.slice(0, 80), message: item.message.slice(0, 1000)
  })), { onConflict: 'batch_id,sheet_name,row_number,field_name,error_code' })
  if (error) throw new Error(error.message)
}

export async function updateImportBatch(batchId: string, patch: { status: 'READY' | 'IMPORTING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' }): Promise<string> {
  const { data, error } = await supabase.rpc('transition_content_import_batch', { p_batch: batchId, p_status: patch.status })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string') throw new Error('import_batch_transition_failed')
  return data
}

export async function importContentStory(batchId: string, story: Record<string, unknown>, images: Array<Record<string, unknown>>, questions: Array<Record<string, unknown>>, tags: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('import_content_story', { p_batch: batchId, p_story: story, p_images: images, p_questions: questions, p_tags: tags })
  if (error) throw new Error(error.message)
  return data as string
}

export async function requestStoryGeneration(input: { topic: string; subject: string; age_min: number; age_max: number; difficulty: number; scenes: number; questions_per_scene: number }): Promise<{ job_id: string; result: unknown }> {
  const { data, error } = await supabase.functions.invoke('content-studio-generate', { body: input })
  if (error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      let serverError: string | undefined
      try {
        const body = await context.clone().json() as { error?: string }
        serverError = body.error
      } catch { /* Fall back to the SDK error when the response is not JSON. */ }
      if (serverError) throw new Error(serverError)
    }
    throw new Error(error.message)
  }
  return data as { job_id: string; result: unknown }
}

export async function saveGeneratedStoryDraft(jobId: string, subjectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_ai_story_draft', { p_job: jobId, p_subject_id: subjectId })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listStoryTags(storyId: string): Promise<string[]> {
  const result = await supabase.from('story_tags').select('tag:content_tags!inner(name)').eq('story_id', storyId)
  const rows = ensure(result.data, result.error) as unknown as Array<{ tag: { name: string } | { name: string }[] }>
  return rows.map((row) => Array.isArray(row.tag) ? row.tag[0]?.name ?? '' : row.tag?.name ?? '').filter(Boolean)
}

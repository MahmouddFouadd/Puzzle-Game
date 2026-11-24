import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import {
  listCategories, listContentStories, listStoryTags, saveStoryMetadata, setReviewStatus,
  type ContentCategory, type ContentSource, type ContentStory, type ReviewStatus
} from '../../content/api'

const reviewLabel: Record<ReviewStatus, 'reviewDraft' | 'reviewInReview' | 'reviewApproved' | 'reviewRejected' | 'reviewArchived'> = {
  DRAFT: 'reviewDraft', IN_REVIEW: 'reviewInReview', APPROVED: 'reviewApproved', REJECTED: 'reviewRejected', ARCHIVED: 'reviewArchived'
}

type MetadataForm = {
  language: 'ar' | 'en'; age_min: string; age_max: string; subject_id: string; difficulty: number;
  source_type: ContentSource; source_reference: string; license_type: string; attribution: string;
  editorial_notes: string; tags: string
}

const emptyForm: MetadataForm = {
  language: 'ar', age_min: '', age_max: '', subject_id: '', difficulty: 1,
  source_type: 'MANUAL', source_reference: '', license_type: 'UNKNOWN', attribution: '', editorial_notes: '', tags: ''
}

export default function ContentLibrary() {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState<ContentStory[]>([])
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [reviewStatus, setReviewStatusFilter] = useState<ReviewStatus | 'ALL'>('ALL')
  const [gameplayStatus, setGameplayStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'ALL'>('ALL')
  const [subjectId, setSubjectId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ContentStory | null>(null)
  const [form, setForm] = useState<MetadataForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [result, categoryRows] = await Promise.all([
        listContentStories({ search, reviewStatus, gameplayStatus, subjectId: subjectId || undefined, page, pageSize: 20 }),
        listCategories()
      ])
      setRows(result.rows); setTotal(result.total); setCategories(categoryRows)
    } catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
    finally { setLoading(false) }
  }, [gameplayStatus, page, reviewStatus, search, subjectId, t])

  useEffect(() => { void reload() }, [reload])

  const openEdit = async (story: ContentStory) => {
    setEditing(story); setError(''); setNotice('')
    const m = story.metadata
    setForm({
      language: m.language, age_min: m.age_min === null ? '' : String(m.age_min), age_max: m.age_max === null ? '' : String(m.age_max),
      subject_id: m.subject_id ?? '', difficulty: m.difficulty, source_type: m.source_type,
      source_reference: m.source_reference ?? '', license_type: m.license_type, attribution: m.attribution ?? '',
      editorial_notes: m.editorial_notes ?? '', tags: (await listStoryTags(story.id)).join(', ')
    })
  }

  const update = <K extends keyof MetadataForm>(key: K, value: MetadataForm[K]) => setForm((old) => ({ ...old, [key]: value }))
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const min = form.age_min.trim() ? Number(form.age_min) : null
    const max = form.age_max.trim() ? Number(form.age_max) : null
    if (min !== null && max !== null && min > max) { setError(t('limitsInvalid')); return }
    setSaving(true); setError('')
    try {
      await saveStoryMetadata(editing.id, {
        language: form.language, age_min: min, age_max: max, subject_id: form.subject_id || null,
        difficulty: form.difficulty, source_type: form.source_type, source_reference: form.source_reference || null,
        license_type: form.license_type, attribution: form.attribution || null, editorial_notes: form.editorial_notes || null
      }, form.tags.split(',').map((v) => v.trim()).filter(Boolean))
      setEditing(null); setNotice(t('metadataSaved')); await reload()
    } catch (e) { setError(e instanceof Error ? e.message : t('errGeneric')) }
    finally { setSaving(false) }
  }

  const submitForReview = async (story: ContentStory) => {
    setError(''); setNotice('')
    try { await setReviewStatus(story.id, 'IN_REVIEW'); setNotice(t('submitReview')); await reload() }
    catch (e) { setError(e instanceof Error ? e.message : t('errGeneric')) }
  }

  const categoryName = (category: ContentCategory) => lang === 'ar' ? category.name_ar : category.name_en

  return (
    <div className="space-y-4">
      <section className="card grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="block xl:col-span-2">{t('searchContent')}
          <input className="input mt-1" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value) }} />
        </label>
        <label className="block">{t('reviewQueue')}
          <select className="input mt-1" value={reviewStatus} onChange={(e) => { setPage(0); setReviewStatusFilter(e.target.value as ReviewStatus | 'ALL') }}>
            <option value="ALL">{t('allStatuses')}</option>
            {Object.entries(reviewLabel).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
          </select>
        </label>
        <label className="block">{t('gameplayStatus')}
          <select className="input mt-1" value={gameplayStatus} onChange={(e) => { setPage(0); setGameplayStatus(e.target.value as typeof gameplayStatus) }}>
            <option value="ALL">{t('allStatuses')}</option><option value="DRAFT">{t('reviewDraft')}</option><option value="PUBLISHED">{t('publishStory')}</option><option value="ARCHIVED">{t('reviewArchived')}</option>
          </select>
        </label>
        <label className="block">{t('subject')}
          <select className="input mt-1" value={subjectId} onChange={(e) => { setPage(0); setSubjectId(e.target.value) }}>
            <option value="">{t('allStatuses')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{categoryName(c)}</option>)}
          </select>
        </label>
      </section>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-ok">{notice}</p>}
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null) }}>
          <form className="card max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto" role="dialog" aria-modal="true" aria-label={t('editMetadata')} onSubmit={(e) => void save(e)}>
            <div className="flex items-center justify-between gap-3"><h3 className="font-display text-2xl">{t('editMetadata')} · {editing.title}</h3><button className="btn-ghost" type="button" onClick={() => setEditing(null)}>{t('cancel')}</button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>{t('ageFrom')}<input className="input mt-1" type="number" min="0" max="99" value={form.age_min} onChange={(e) => update('age_min', e.target.value)} /></label>
              <label>{t('ageTo')}<input className="input mt-1" type="number" min="0" max="99" value={form.age_max} onChange={(e) => update('age_max', e.target.value)} /></label>
              <label>{t('subject')}<select className="input mt-1" value={form.subject_id} onChange={(e) => update('subject_id', e.target.value)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{categoryName(c)}</option>)}</select></label>
              <label>{t('difficulty')}<select className="input mt-1" value={form.difficulty} onChange={(e) => update('difficulty', Number(e.target.value))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
              <label>{t('languageLabel')}<select className="input mt-1" value={form.language} onChange={(e) => update('language', e.target.value as 'ar' | 'en')}><option value="ar">العربية</option><option value="en">English</option></select></label>
              <label>{t('sourceType')}<select className="input mt-1" value={form.source_type} onChange={(e) => update('source_type', e.target.value as ContentSource)}><option value="MANUAL">{t('sourceManual')}</option><option value="AI">{t('sourceAI')}</option><option value="IMPORT">{t('sourceImport')}</option></select></label>
              <label>{t('sourceReference')}<input className="input mt-1" value={form.source_reference} onChange={(e) => update('source_reference', e.target.value)} /></label>
              <label>{t('licenseType')}<input className="input mt-1" value={form.license_type} onChange={(e) => update('license_type', e.target.value)} /></label>
              <label>{t('attribution')}<input className="input mt-1" value={form.attribution} onChange={(e) => update('attribution', e.target.value)} /></label>
              <label className="sm:col-span-2">Tags (comma separated)<input className="input mt-1" value={form.tags} onChange={(e) => update('tags', e.target.value)} /></label>
              <label className="sm:col-span-2">{t('editorialNotes')}<textarea className="input mt-1" rows={3} value={form.editorial_notes} onChange={(e) => update('editorial_notes', e.target.value)} /></label>
            </div>
            {error && <p role="alert" className="text-danger">{error}</p>}
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</button>
          </form>
        </div>
      )}
      {loading ? <p role="status">{t('loading')}</p> : rows.length === 0 ? <p className="card">{t('noContent')}</p> : (
        <ul className="space-y-3">
          {rows.map((story) => (
            <li key={story.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{story.title}</h3>
                <p className="text-sm opacity-75">{story.categoryInfo ? categoryName({ ...story.categoryInfo, id: '', parent_id: null, sort_order: 0, is_active: true, description: null, slug: story.categoryInfo.slug }) : story.subject ?? '—'} · {story.metadata.age_min ?? '—'}–{story.metadata.age_max ?? '—'} · {t(reviewLabel[story.metadata.review_status])}</p>
                <p className="text-xs opacity-60">{t('gameplayStatus')}: {story.status} · {story.metadata.source_type}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" type="button" onClick={() => void openEdit(story)}>{t('editMetadata')}</button>
                <Link className="btn-ghost" to={`/admin/stories/${story.id}`}>{t('edit')}</Link>
                {story.metadata.review_status !== 'IN_REVIEW' && story.metadata.review_status !== 'APPROVED' && <button className="btn-primary" type="button" onClick={() => void submitForReview(story)}>{t('submitReview')}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <footer className="flex items-center justify-between gap-3">
        <p className="text-sm opacity-70">{total} · {t('pageLabel')} {page + 1} / {Math.max(1, Math.ceil(total / 20))}</p>
        <div className="flex gap-2">
          <button className="btn-ghost" type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t('previousPage')}</button>
          <button className="btn-ghost" type="button" disabled={(page + 1) * 20 >= total} onClick={() => setPage((p) => p + 1)}>{t('nextPage')}</button>
        </div>
      </footer>
    </div>
  )
}

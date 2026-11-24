import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n, type Key } from '../../lib/i18n'
import { getStory } from '../../stories/api'
import { errorKey } from '../../stories/errors'
import type { Story } from '../../stories/types'
import { publishStory, setStoryStatus, validateStory } from '../../questions/api'
import type { Issue, Validation } from '../../questions/types'
import { StoryTabs } from '../../components/StoryTabs'

const KEYS: Record<string, Key> = {
  no_images: 'issue_no_images', single_image: 'issue_single_image', image_no_pieces: 'issue_image_no_pieces',
  piece_uncovered: 'issue_piece_uncovered', unapproved_mappings: 'issue_unapproved_mappings',
  mapped_question_unpublished: 'issue_mapped_question_unpublished', unmapped_questions: 'issue_unmapped_questions', missing_hint: 'issue_missing_hint'
}

export default function PublishPanel() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [story, setStory] = useState<Story | null>(null)
  const [v, setV] = useState<Validation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fail = useCallback((e: unknown) => { setNotice(null); setError(t(errorKey(e))) }, [t])
  const reload = useCallback(async () => {
    if (!id) return
    const s = await getStory(id)
    setStory(s)
    setV(await validateStory(id))
  }, [id])
  useEffect(() => { reload().catch(fail) }, [reload, fail])

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true); setError(null); setNotice(null)
    try { await fn(); await reload(); if (ok) setNotice(ok) } catch (e) { fail(e); await reload().catch(() => undefined) }
    setBusy(false)
  }
  const label = (i: Issue) => `${t(KEYS[i.code] ?? 'errGeneric')}${i.image ? `: ${i.image}` : ''}${i.count ? ` (${i.count})` : ''}`

  const publish = () => {
    if (!id || !v) return
    if (v.warnings.length > 0 && !window.confirm(t('confirmWarnings'))) return
    void run(() => publishStory(id), t('publishedOk'))
  }

  if (!id) return null
  const status = story?.status
  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/admin/stories" className="underline text-gold-400">{t('back')}</Link>
      <h2 className="font-display text-3xl">{story?.title} <span className="text-base opacity-60">{status}</span></h2>
      <StoryTabs storyId={id} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-ok">{notice}</p>}

      <section className="card space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold">{t('validation')}</h3>
          <button className="btn-ghost" type="button" disabled={busy} onClick={() => void run(async () => undefined)}>{t('refresh')}</button></div>
        {!v ? <p role="status">{t('loading')}</p> : v.errors.length === 0 && v.warnings.length === 0 ? <p className="text-ok">{t('noIssues')}</p> : (
          <>
            {v.errors.length > 0 && <div><h4 className="text-danger font-semibold">{t('mustFix')}</h4><ul className="list-disc ps-5">{v.errors.map((i, k) => <li key={k}>{label(i)}</li>)}</ul></div>}
            {v.warnings.length > 0 && <div><h4 className="text-gold-400 font-semibold">{t('warningsHeading')}</h4><ul className="list-disc ps-5">{v.warnings.map((i, k) => <li key={k}>{label(i)}</li>)}</ul></div>}
          </>
        )}
      </section>

      <div className="flex gap-2 flex-wrap">
        {status !== 'PUBLISHED' && status !== 'ARCHIVED' && (
          <button className="btn-primary" type="button" disabled={busy || !v || v.errors.length > 0} onClick={publish}>{t('publishStory')}</button>
        )}
        {status === 'PUBLISHED' && <button className="btn-ghost" type="button" disabled={busy} onClick={() => void run(() => setStoryStatus(id, 'DRAFT'))}>{t('unpublish')}</button>}
        {status === 'ARCHIVED' && <button className="btn-ghost" type="button" disabled={busy} onClick={() => void run(() => setStoryStatus(id, 'DRAFT'))}>{t('restore')}</button>}
        {status !== 'ARCHIVED' && <button className="btn-ghost" type="button" disabled={busy} onClick={() => void run(() => setStoryStatus(id, 'ARCHIVED'))}>{t('archive')}</button>}
      </div>
    </div>
  )
}

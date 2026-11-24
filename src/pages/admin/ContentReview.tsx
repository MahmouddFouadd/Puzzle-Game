import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useI18n } from '../../lib/i18n'
import { getReviewHistory, listContentStories, setReviewStatus, type ContentStory } from '../../content/api'

export default function ContentReview() {
  const { can } = useAuth()
  const { t } = useI18n()
  const [rows, setRows] = useState<ContentStory[]>([])
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<Record<string, Array<{ id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string }>>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { const result = await listContentStories({ reviewStatus: 'IN_REVIEW', page: 0, pageSize: 100 }); setRows(result.rows) }
    catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void reload() }, [reload])

  const decide = async (story: ContentStory, status: 'APPROVED' | 'REJECTED') => {
    const reason = reasons[story.id]?.trim() ?? ''
    if (status === 'REJECTED' && !reason) { setError(t('reviewReason')); return }
    setBusyId(story.id); setError(''); setNotice('')
    try { await setReviewStatus(story.id, status, reason || undefined); setNotice(t(status === 'APPROVED' ? 'approveContent' : 'rejectContent')); await reload() }
    catch (e) { setError(e instanceof Error ? e.message : t('errGeneric')) }
    finally { setBusyId('') }
  }

  const toggleHistory = async (storyId: string) => {
    if (expanded === storyId) { setExpanded(null); return }
    setExpanded(storyId)
    if (history[storyId]) return
    try {
      const entries = await getReviewHistory(storyId)
      setHistory((old) => ({ ...old, [storyId]: entries }))
    }
    catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
  }

  if (!can('content.review')) return <p role="alert" className="text-danger">{t('notAllowed')}</p>
  return (
    <div className="space-y-4">
      <p className="card text-sm">{t('reviewQueue')}. {t('publishStory')} remains a separate action in the existing story workflow.</p>
      {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-ok">{notice}</p>}
      {loading ? <p role="status">{t('loading')}</p> : rows.length === 0 ? <p className="card">{t('noReviewItems')}</p> : (
        <ul className="space-y-3">{rows.map((story) => (
          <li key={story.id} className="card space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><h3 className="font-display text-xl">{story.title}</h3><p className="text-sm opacity-75">{story.description || '—'}</p><p className="text-xs opacity-70">{t('subject')}: {story.categoryInfo?.name_en ?? story.subject ?? '—'} · {t('ageRange')}: {story.metadata.age_min ?? '—'}–{story.metadata.age_max ?? '—'} · {t('difficulty')}: {story.metadata.difficulty}</p><p className="text-xs opacity-70">{t('sourceReference')}: {story.metadata.source_reference ?? '—'} · {t('licenseType')}: {story.metadata.license_type}</p></div>
              <div className="flex flex-wrap gap-2"><Link className="btn-ghost" to={`/admin/stories/${story.id}`}>{t('tabInfo')}</Link><Link className="btn-ghost" to={`/admin/stories/${story.id}/questions`}>{t('tabQuestions')}</Link><button className="btn-ghost" type="button" onClick={() => void toggleHistory(story.id)}>{t('reviewHistory')}</button></div>
            </div>
            <label className="block">{t('reviewReason')}<textarea className="input mt-1" rows={2} value={reasons[story.id] ?? ''} onChange={(e) => setReasons((old) => ({ ...old, [story.id]: e.target.value }))} /></label>
            <div className="flex flex-wrap gap-2"><button className="btn-primary" type="button" disabled={busyId === story.id} onClick={() => void decide(story, 'APPROVED')}>{t('approveContent')}</button><button className="btn-ghost text-danger" type="button" disabled={busyId === story.id} onClick={() => void decide(story, 'REJECTED')}>{t('rejectContent')}</button></div>
            {expanded === story.id && <div className="border-t border-parchment-200/15 pt-3"><h4 className="font-semibold">{t('reviewHistory')}</h4>{(history[story.id] ?? []).length ? <ol className="mt-2 space-y-2 text-sm">{history[story.id].map((entry) => <li key={entry.id}>{entry.from_status ?? '—'} → {entry.to_status} · {entry.reason ?? '—'} · {new Date(entry.created_at).toLocaleString()}</li>)}</ol> : <p className="mt-2 text-sm opacity-70">—</p>}</div>}
          </li>
        ))}</ul>
      )}
    </div>
  )
}

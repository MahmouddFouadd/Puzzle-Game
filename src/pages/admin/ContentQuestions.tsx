import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { listQuestionBank } from '../../content/api'

export default function ContentQuestions() {
  const { t } = useI18n()
  const [rows, setRows] = useState<Array<{ id: string; text: string; type: string; published: boolean; story_id: string; story_title: string }>>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('ALL')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { const result = await listQuestionBank({ search, type, page, pageSize: 25 }); setRows(result.rows); setTotal(result.total) }
    catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
    finally { setLoading(false) }
  }, [page, search, t, type])
  useEffect(() => { void reload() }, [reload])

  return (
    <div className="space-y-4">
      <section className="card grid gap-3 sm:grid-cols-2">
        <label>{t('searchContent')}<input className="input mt-1" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} /></label>
        <label>{t('questionType')}<select className="input mt-1" value={type} onChange={(e) => { setType(e.target.value); setPage(0) }}><option value="ALL">{t('allStatuses')}</option><option value="MULTIPLE_CHOICE">{t('typeMC')}</option><option value="TRUE_FALSE">{t('typeTF')}</option><option value="SHORT_TEXT">{t('typeST')}</option></select></label>
      </section>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {loading ? <p role="status">{t('loading')}</p> : rows.length === 0 ? <p className="card">{t('noQuestions')}</p> : (
        <ul className="space-y-2">{rows.map((row) => (
          <li key={row.id} className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><p>{row.text}</p><p className="text-xs opacity-70">{row.type} · {row.published ? t('readyFlag') : t('reviewDraft')} · {t('story')}: {row.story_title}</p></div>
            <Link className="btn-ghost shrink-0" to={`/admin/stories/${row.story_id}/questions`}>{t('edit')}</Link>
          </li>
        ))}</ul>
      )}
      <footer className="flex items-center justify-between gap-3"><p className="text-sm opacity-70">{total} · {t('pageLabel')} {page + 1} / {Math.max(1, Math.ceil(total / 25))}</p><div className="flex gap-2"><button className="btn-ghost" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t('previousPage')}</button><button className="btn-ghost" type="button" disabled={(page + 1) * 25 >= total} onClick={() => setPage((p) => p + 1)}>{t('nextPage')}</button></div></footer>
    </div>
  )
}

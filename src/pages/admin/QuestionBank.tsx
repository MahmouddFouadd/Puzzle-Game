import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { getStory } from '../../stories/api'
import { errorKey } from '../../stories/errors'
import type { Story } from '../../stories/types'
import { deleteQuestion, listMappings, listQuestions, saveQuestion } from '../../questions/api'
import { draftFromRow, draftProblem, emptyDraft } from '../../questions/draft'
import type { QType, QuestionDraft, QuestionRow } from '../../questions/types'
import { StoryTabs } from '../../components/StoryTabs'

export default function QuestionBank() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [story, setStory] = useState<Story | null>(null)
  const [rows, setRows] = useState<QuestionRow[]>([])
  const [mapped, setMapped] = useState<ReadonlySet<string>>(new Set())
  const [draft, setDraft] = useState<QuestionDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fail = useCallback((e: unknown) => setError(t(errorKey(e))), [t])
  const reload = useCallback(async () => {
    if (!id) return
    const [s, q, m] = await Promise.all([getStory(id), listQuestions(id), listMappings(id)])
    setStory(s); setRows(q); setMapped(new Set(m.map((x) => x.question_id)))
  }, [id])
  useEffect(() => { reload().catch(fail) }, [reload, fail])

  const locked = story?.status === 'PUBLISHED'
  const set = <K extends keyof QuestionDraft>(k: K, v: QuestionDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  const save = async () => {
    if (!id || !draft) return
    if (draftProblem(draft)) { setError(t('errInvalidQuestion')); return }
    setBusy(true); setError(null)
    try { await saveQuestion(id, draft); setDraft(null); await reload() } catch (e) { fail(e) }
    setBusy(false)
  }
  const remove = async (q: QuestionRow) => {
    if (!window.confirm(t('confirmDelete'))) return
    try { await deleteQuestion(q.id); await reload() } catch (e) { fail(e) }
  }
  const typeLabel = (x: QType) => (x === 'MULTIPLE_CHOICE' ? t('typeMC') : x === 'TRUE_FALSE' ? t('typeTF') : t('typeST'))

  if (!id) return null
  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/admin/stories" className="underline text-gold-400">{t('back')}</Link>
      <h2 className="font-display text-3xl">{story?.title}</h2>
      <StoryTabs storyId={id} />
      {error && <p role="alert" className="text-danger">{error}</p>}

      {draft ? (
        <section className="card space-y-3">
          <label className="block">{t('questionText')}<textarea className="input mt-1" rows={3} value={draft.text} onChange={(e) => set('text', e.target.value)} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">{t('questionType')}
              <select className="input mt-1" value={draft.type} onChange={(e) => set('type', e.target.value as QType)}>
                <option value="MULTIPLE_CHOICE">{t('typeMC')}</option><option value="TRUE_FALSE">{t('typeTF')}</option><option value="SHORT_TEXT">{t('typeST')}</option>
              </select>
            </label>
            <label className="block">{t('difficulty')}
              <select className="input mt-1" value={draft.difficulty} onChange={(e) => set('difficulty', Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
            </label>
            <label className="block">{t('languageLabel')}
              <select className="input mt-1" value={draft.language} onChange={(e) => set('language', e.target.value as 'en' | 'ar')}><option value="en">English</option><option value="ar">العربية</option></select>
            </label>
          </div>

          {draft.type === 'MULTIPLE_CHOICE' && (
            <div className="space-y-2">
              {draft.options.map((o, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="radio" name="correct" aria-label={t('correctOption')} checked={o.correct}
                    onChange={() => set('options', draft.options.map((x, j) => ({ ...x, correct: i === j })))} />
                  <input className="input" placeholder={`${t('optionLabel')} ${i + 1}`} aria-label={`${t('optionLabel')} ${i + 1}`} value={o.text}
                    onChange={(e) => set('options', draft.options.map((x, j) => (i === j ? { ...x, text: e.target.value } : x)))} />
                  {draft.options.length > 2 && <button className="btn-ghost" type="button" aria-label={t('deleteLabel')}
                    onClick={() => set('options', draft.options.filter((_, j) => j !== i).map((x, j, arr) => ({ ...x, correct: arr.some((y) => y.correct) ? x.correct : j === 0 })))}>✕</button>}
                </div>
              ))}
              {draft.options.length < 8 && <button className="btn-ghost" type="button" onClick={() => set('options', [...draft.options, { text: '', correct: false }])}>{t('addOption')}</button>}
            </div>
          )}
          {draft.type === 'TRUE_FALSE' && (
            <select className="input" aria-label={t('questionType')} value={draft.tfAnswer} onChange={(e) => set('tfAnswer', e.target.value as 'true' | 'false')}>
              <option value="true">{t('trueLabel')}</option><option value="false">{t('falseLabel')}</option>
            </select>
          )}
          {draft.type === 'SHORT_TEXT' && (
            <label className="block">{t('acceptedAnswers')}
              <textarea className="input mt-1" rows={3} value={draft.answers.join('\n')} onChange={(e) => set('answers', e.target.value.split('\n'))} />
            </label>
          )}
          <label className="block">{t('explanation')}<textarea className="input mt-1" rows={2} value={draft.explanation} onChange={(e) => set('explanation', e.target.value)} /></label>
          <label className="block">{t('hint')}<input className="input mt-1" value={draft.hint} onChange={(e) => set('hint', e.target.value)} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} />{t('readyFlag')}</label>
          <div className="flex gap-2">
            <button className="btn-primary" type="button" disabled={busy} onClick={() => void save()}>{t('save')}</button>
            <button className="btn-ghost" type="button" onClick={() => { setDraft(null); setError(null) }}>{t('cancel')}</button>
          </div>
        </section>
      ) : (
        <button className="btn-primary" type="button" disabled={locked} onClick={() => setDraft(emptyDraft(story?.language ?? 'en'))}>{t('addQuestion')}</button>
      )}

      {rows.length === 0 ? <p className="opacity-70">{t('noQuestions')}</p> : (
        <ul className="space-y-2">
          {rows.map((q) => (
            <li key={q.id} className="card flex gap-3 justify-between items-start">
              <div>
                <div>{q.text}</div>
                <div className="text-sm opacity-70">{typeLabel(q.type)} · {q.published ? t('readyFlag') : '—'} · {mapped.has(q.id) ? t('approvedLabel') + '/' + t('suggestedLabel') : t('unassigned')}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="btn-ghost" type="button" disabled={locked} onClick={() => setDraft(draftFromRow(q))}>{t('edit')}</button>
                <button className="btn-ghost text-danger" type="button" disabled={locked} onClick={() => void remove(q)}>{t('deleteLabel')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

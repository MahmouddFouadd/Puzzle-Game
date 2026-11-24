import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { getStory, listImages } from '../../stories/api'
import { errorKey } from '../../stories/errors'
import type { Story, StoryImage } from '../../stories/types'
import { applySuggestions, approveAll, listMappings, listPieces, listQuestions, setMapping } from '../../questions/api'
import { suggestMappings } from '../../questions/suggest'
import type { Mapping, Piece, QuestionRow } from '../../questions/types'
import { StoryTabs } from '../../components/StoryTabs'

export default function Assignments() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [story, setStory] = useState<Story | null>(null)
  const [images, setImages] = useState<StoryImage[]>([])
  const [pieces, setPieces] = useState<Piece[]>([])
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fail = useCallback((e: unknown) => setError(t(errorKey(e))), [t])
  const reload = useCallback(async () => {
    if (!id) return
    const [s, im, p, q, m] = await Promise.all([getStory(id), listImages(id), listPieces(id), listQuestions(id), listMappings(id)])
    setStory(s); setImages(im); setPieces(p); setQuestions(q); setMappings(m)
  }, [id])
  useEffect(() => { reload().catch(fail) }, [reload, fail])

  const byImage = useMemo(() => images.map((img) => ({
    img, pieces: pieces.filter((p) => p.image_id === img.id).sort((a, b) => a.row_idx - b.row_idx || a.col_idx - b.col_idx)
  })), [images, pieces])
  const mapOf = useMemo(() => new Map(mappings.map((m) => [m.question_id, m])), [mappings])
  const load = useMemo(() => { const c = new Map<string, number>(); mappings.forEach((m) => c.set(m.piece_id, (c.get(m.piece_id) ?? 0) + 1)); return c }, [mappings])
  const readyIds = useMemo(() => new Set(questions.filter((q) => q.published).map((q) => q.id)), [questions])
  const covered = useMemo(() => new Set(mappings.filter((m) => m.approved && readyIds.has(m.question_id)).map((m) => m.piece_id)), [mappings, readyIds])
  const locked = story?.status === 'PUBLISHED'

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { fail(e) } setBusy(false) }

  const suggest = () => run(async () => {
    if (!id) return
    const keep = new Map(mappings.filter((m) => m.approved).map((m) => [m.question_id, m.piece_id]))
    const result = suggestMappings(
      questions.filter((q) => q.published).map((q) => ({ id: q.id, text: q.text, explanation: q.explanation, hint: q.hint })),
      byImage.map((b) => ({ id: b.img.id, title: b.img.title, description: b.img.description, pieceIds: b.pieces.map((p) => p.id) })),
      keep, false, Math.floor(Math.random() * 1_000_000))
    await applySuggestions(id, result.map((r) => ({ question: r.questionId, piece: r.pieceId })))
  })

  if (!id) return null
  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/admin/stories" className="underline text-gold-400">{t('back')}</Link>
      <h2 className="font-display text-3xl">{story?.title}</h2>
      <StoryTabs storyId={id} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex gap-2 flex-wrap">
        <button className="btn-primary" type="button" disabled={busy || locked} onClick={() => void suggest()}>{t('suggest')}</button>
        <button className="btn-ghost" type="button" disabled={busy || locked} onClick={() => void run(() => approveAll(id))}>{t('approveAll')}</button>
      </div>

      <section className="card">
        <h3 className="font-semibold mb-2">{t('coverage')}</h3>
        <ul className="space-y-1 text-sm">
          {byImage.map((b) => (
            <li key={b.img.id}>{b.img.position}. {b.img.title}: {b.pieces.filter((p) => covered.has(p.id)).length}/{b.pieces.length} {t('pieceUnit')}</li>
          ))}
        </ul>
      </section>

      <ul className="space-y-2">
        {questions.map((q) => {
          const m = mapOf.get(q.id)
          return (
            <li key={q.id} className="card space-y-2">
              <div>{q.text} {!q.published && <span className="text-sm opacity-60">({t('readyFlag')}: ✕)</span>}</div>
              <div className="flex gap-2 items-center flex-wrap">
                <select className="input max-w-xs" aria-label={t('choosePiece')} disabled={busy || locked} value={m?.piece_id ?? ''}
                  onChange={(e) => void run(() => setMapping(q.id, e.target.value || null))}>
                  <option value="">{t('choosePiece')}</option>
                  {byImage.map((b) => (
                    <optgroup key={b.img.id} label={`${b.img.position}. ${b.img.title}`}>
                      {b.pieces.map((p) => <option key={p.id} value={p.id}>{p.row_idx + 1}-{p.col_idx + 1}{(load.get(p.id) ?? 0) - (m?.piece_id === p.id ? 1 : 0) > 0 ? ' •' : ''}</option>)}
                    </optgroup>
                  ))}
                </select>
                <span className={`text-sm ${m ? (m.approved ? 'text-ok' : 'text-gold-400') : 'opacity-60'}`}>
                  {m ? (m.approved ? t('approvedLabel') : t('suggestedLabel')) : t('unassigned')}
                </span>
                {m && !m.approved && !locked && <button className="btn-ghost" type="button" disabled={busy} onClick={() => void run(() => setMapping(q.id, m.piece_id))}>{t('approvedLabel')}</button>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

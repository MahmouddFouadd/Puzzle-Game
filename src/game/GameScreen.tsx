import { useEffect, useRef, useState } from 'react'
import { seededShuffle } from '../lib/shuffle'
import { useI18n, type Key } from '../lib/i18n'
import { errorKey } from '../stories/errors'
import { decideCard, drawCard, drawRescueCard, submitAnswer } from './api'
import { PieceBoard } from './PieceBoard'
import { Scoreboard } from './Scoreboard'
import { useTeamState } from './useTeamState'
import type { AnswerResult, DecisionResult } from './types'

const DECISION_MSG: Record<string, Key> = {
  PLACED_CORRECTLY: 'resultPlacedOk', PLACED_INCORRECTLY: 'resultPlacedBad', DISCARDED_CORRECTLY: 'resultDiscOk', DISCARDED_INCORRECTLY: 'resultDiscBad'
}

export function GameScreen({ roomId, teamId, userId }: { roomId: string; teamId: string; userId: string }) {
  const { t } = useI18n()
  const { state, board, online, reload } = useTeamState(roomId, teamId)
  const [answer, setAnswer] = useState('')
  const [option, setOption] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [decision, setDecision] = useState<DecisionResult | null>(null)
  const [draggingPiece, setDraggingPiece] = useState(false)
  const [notice, setNotice] = useState<Key | null>(null)
  const [now, setNow] = useState(Date.now())
  // One idempotency key per pending action: a retry after a network error reuses it, so the server never acts twice.
  const keys = useRef<Record<string, string>>({})
  const key = (k: string) => (keys.current[k] ??= crypto.randomUUID())
  const done = (k: string) => { delete keys.current[k] }

  const card = state?.card ?? null
  useEffect(() => { setAnswer(''); setOption(null); setDraggingPiece(false) }, [card?.draw_id])
  useEffect(() => {
    if (!card?.time_limit_seconds || card.state !== 'DRAWN') return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [card?.draw_id, card?.time_limit_seconds, card?.state])

  if (!state) return <p role="status" className="p-4">{t('loading')}</p>
  const isCaptain = state.team.captain === userId
  const playing = state.room.status === 'PLAYING' && state.team.state === 'ACTIVE'
  const canAct = isCaptain && playing && !busy

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn(); await reload() } catch (e) { setError(t(errorKey(e))) }
    setBusy(false)
  }
  const draw = (rescue: boolean) => act(async () => {
    const k = rescue ? 'rescue' : 'draw'
    const r = await (rescue ? drawRescueCard(teamId, key(k)) : drawCard(teamId, key(k)))
    done(k); setAnswerResult(null); setDecision(null)
    setNotice(r.status === 'deck_empty' ? (r.recovery === 'rescue' ? 'rescueTitle' : 'stuckMsg') : null)
  })
  const submit = () => card && act(async () => {
    const k = `answer-${card.draw_id}`
    const r = await submitAnswer(card.draw_id, card.question.type === 'MULTIPLE_CHOICE' ? null : answer, option, key(k))
    delete keys.current[k]; setAnswerResult(r); setDecision(null)
  })
  const decide = (d: 'PLACE' | 'DISCARD') => card && act(async () => {
    const k = `decide-${card.draw_id}`
    const r = await decideCard(card.draw_id, d, key(k))
    delete keys.current[k]; setDecision(r); setAnswerResult(null)
  })
  const placeDraggedPiece = () => {
    if (!draggingPiece || !canAct || card?.state !== 'ANSWER_CORRECT') return
    setDraggingPiece(false)
    void decide('PLACE')
  }

  const left = card?.time_limit_seconds && card.state === 'DRAWN' ? Math.max(0, Math.ceil((Date.parse(card.drawn_at) + card.time_limit_seconds * 1000 - now) / 1000)) : null
  const q = card?.question

  return (
    <section className="space-y-4" aria-label={state.team.name}>
      {!online && <p role="status" className="card text-gold-400">{t('offlineMsg')}</p>}
      {state.room.status === 'PAUSED' && <p role="status" className="card">{t('pausedMsg')}</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}

      <header className="story-panel space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><div className="truncate font-display text-2xl">{state.team.name}</div><div className="text-sm opacity-70">{isCaptain ? `★ ${t('youAreCaptain')}` : t('waitCaptain')}</div></div>
          <div className="score-badge"><div key={state.team.score} className="pop-in font-display text-3xl text-gold-400" aria-live="polite">{state.team.score}</div><div className="text-xs opacity-80">{t('scoreLabel')}</div></div>
        </div>
        <div className="progress-track" role="progressbar" aria-label={t('piecesFound')} aria-valuemin={0} aria-valuemax={state.progress.total} aria-valuenow={state.progress.revealed}>
          <div className="progress-fill" style={{ width: `${state.progress.total ? (state.progress.revealed / state.progress.total) * 100 : 0}%` }} />
        </div>
      </header>

      {state.image && <PieceBoard width={state.image.width} height={state.image.height} pieces={state.pieces} label={t('yourBoard')}
        dropActive={draggingPiece && card?.state === 'ANSWER_CORRECT'} onDrop={placeDraggedPiece} />}
      <div className="text-sm opacity-80" aria-live="polite">{t('piecesFound')}: {state.progress.revealed}/{state.progress.total} · {t('cardsLeft')}: {state.cards_left}</div>

      {state.team.state === 'COMPLETED' && (
        <p className="story-panel pop-in text-center font-display text-2xl text-gold-400" role="status">🎉 {t('completedMsg')} {state.team.rank ? `· ${t('rankLabel')} ${state.team.rank}` : ''}</p>
      )}
      {(state.team.state === 'ABANDONED' || state.team.state === 'DISQUALIFIED') && <p className="card" role="status">{t('teamStopped')}</p>}

      {answerResult && (
        <div className={`card ${answerResult.correct ? 'border-ok' : 'border-danger'}`} role="status">
          <strong>{answerResult.correct ? t('correctMsg') : answerResult.timeout ? t('timeoutMsg') : answerResult.retry ? `${t('retryMsg')} (${answerResult.attempts_left} ${t('attemptsLeft')})` : t('wrongMsg')}</strong>
          {typeof answerResult.points === 'number' && answerResult.points !== 0 && <span> {answerResult.points} {t('pointsWord')}</span>}
          {answerResult.correct_answer && <div>{t('correctAnswerWas')}: {answerResult.correct_answer}</div>}
          {answerResult.explanation && <div className="text-sm opacity-80 mt-1">{t('explanationLabel')} {answerResult.explanation}</div>}
        </div>
      )}
      {decision && (
        <div className="card" role="status"><strong>{t(DECISION_MSG[decision.result] ?? 'errGeneric')}</strong>{decision.points !== 0 && <span> {decision.points > 0 ? '+' : ''}{decision.points} {t('pointsWord')}</span>}</div>
      )}
      {notice && !card && <p className="card" role="status">{t(notice)}</p>}

      {card && q && (
        <article key={card.draw_id} className="parchment-panel pop-in space-y-3">
          <div className="flex justify-between text-sm"><span className="font-semibold text-sea-600">{card.kind === 'RESCUE' ? t('rescueCard') : card.kind === 'RECYCLED' ? t('recycledCard') : t('clueCard')}</span>{left !== null && <span aria-live="off" className={`rounded-full px-2 font-bold ${left <= 10 ? 'bg-danger text-parchment-50' : 'bg-ink-900/10'}`}>⏱ {left}s</span>}</div>
          <p className="font-display text-xl leading-relaxed">{q.text}</p>
          {q.hint && <p className="text-sm text-ink-700">💡 {q.hint}</p>}
          {card.state === 'DRAWN' && (
            <>
              {q.type === 'MULTIPLE_CHOICE' && (
                <div role="radiogroup" className="space-y-2">{seededShuffle(q.options, `${roomId}:${teamId}:${card.draw_id}`).map((o) => (
                  <label key={o.id} className={`flex gap-2 items-center rounded-xl border-2 bg-white/60 p-3 font-semibold ${option === o.id ? 'border-sea-500 bg-sea-500/15' : 'border-ink-900/15'}`}>
                    <input type="radio" name="opt" disabled={!canAct} checked={option === o.id} onChange={() => setOption(o.id)} />{o.text}</label>))}</div>
              )}
              {q.type === 'TRUE_FALSE' && (
                <div className="flex gap-2">{(['true', 'false'] as const).map((v) => (
                  <button key={v} type="button" disabled={!canAct} onClick={() => setAnswer(v)} aria-pressed={answer === v}
                    className={`btn flex-1 border-2 ${answer === v ? 'border-sea-500 bg-sea-500 text-parchment-50' : 'border-ink-900/20 bg-white/60'}`}>{v === 'true' ? t('trueLabel') : t('falseLabel')}</button>))}</div>
              )}
              {q.type === 'SHORT_TEXT' && <input className="input bg-white text-ink-900" aria-label={t('yourAnswer')} placeholder={t('yourAnswer')} maxLength={500} disabled={!canAct} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
              <button className="btn-primary w-full" type="button" disabled={!canAct || (q.type === 'MULTIPLE_CHOICE' ? !option : !answer.trim())} onClick={() => void submit()}>{t('submitAnswer')}</button>
            </>
          )}
          {card.state === 'ANSWER_CORRECT' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-sea-600/40 bg-sea-500/10 p-3 text-center text-sm" aria-live="polite">
                <p className="mb-2">{t('dragPieceToImage')}</p>
                <button type="button" draggable disabled={!canAct} onDragStart={() => setDraggingPiece(true)}
                  onDragEnd={() => setDraggingPiece(false)} onPointerDown={() => setDraggingPiece(true)}
                  onPointerUp={() => { if (draggingPiece) placeDraggedPiece() }}
                  className={`mx-auto block rounded-xl border-2 border-dashed border-sea-600 bg-white/70 px-5 py-3 font-semibold text-sea-600 transition ${draggingPiece ? 'scale-105 bg-gold-500/20' : 'hover:bg-gold-500/10'}`}>
                  {t('dragPiece')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary" type="button" disabled={!canAct} onClick={() => void decide('PLACE')}>{t('placeOnImage')}</button>
              <button className="btn border-2 border-ink-900/25 bg-white/60" type="button" disabled={!canAct} onClick={() => void decide('DISCARD')}>{t('discardBasket')}</button>
              </div>
            </div>
          )}
        </article>
      )}

      {!card && playing && state.recovery === 'NONE' && (
        <button className="btn-primary w-full" type="button" disabled={!canAct} onClick={() => void draw(false)}>{t('drawCard')}</button>
      )}
      {!card && playing && state.recovery === 'RESCUE_AVAILABLE' && (
        <div className="card space-y-2"><p>{t('rescueTitle')}</p><button className="btn-primary w-full" type="button" disabled={!canAct} onClick={() => void draw(true)}>{t('rescueBtn')}</button></div>
      )}
      {!card && playing && state.recovery === 'STUCK' && <p className="card" role="status">{t('stuckMsg')}</p>}

      <Scoreboard rows={board} myTeam={teamId} finished={state.room.status === 'FINISHED'} />
    </section>
  )
}

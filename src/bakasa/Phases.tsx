import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { advance, bakasaError, castVote, guessOptions, markSeen, moreQuestions, myRole, pairDone, postClue, rematch, skipTurn, spyGuess, startRound,
  type BakasaPlayer, type BakasaRole, type BakasaState, type WordOption } from './api'
import { Avatar, playSound } from './ui'
import { ScratchCard } from './ScratchCard'

const QUESTION_PROMPTS = [
  ['بتلاقيه فين غالبًا؟', 'Where do you usually find it?'], ['بتستخدمه إمتى؟', 'When do you use it?'], ['لونه إيه في الغالب؟', 'What colour is it usually?'],
  ['حجمه كبير ولا صغير؟', 'Is it big or small?'], ['بتحبه؟ ليه؟', 'Do you like it? Why?'], ['ينفع يتاكل؟', 'Can you eat it?']
]

function usePlayers(state: BakasaState) {
  return useMemo(() => new Map(state.players.map((p) => [p.user_id, p])), [state.players])
}

/** The card face under the scratch foil (or under a peek). */
export function RoleFace({ role, ar }: { role: Pick<BakasaRole, 'is_spy' | 'word_ar' | 'word_en' | 'category_ar' | 'category_en' | 'emoji' | 'color'>; ar: boolean }) {
  return role.is_spy ? (
    <div className="grid h-full place-items-center rounded-3xl p-5 text-center" style={{ background: 'radial-gradient(circle at 50% 30%, #5a1d6e, #1b1340)', border: '3px solid #ff6fa8' }}>
      <div className="space-y-3">
        <div className="text-6xl">🕵️</div>
        <div className="font-display text-3xl text-bk-pink">{ar ? 'أنت البِكس!' : 'You are the spy!'}</div>
        <div className="bk-chip mx-auto bg-white/10">{role.emoji} {ar ? role.category_ar : role.category_en}</div>
        <p className="text-sm opacity-85">{ar ? 'حاول تفهم الكلمة من الأسئلة من غير ما حد يكشفك!' : 'Work out the word from the questions without getting caught!'}</p>
      </div>
    </div>
  ) : (
    <div className="grid h-full place-items-center rounded-3xl p-5 text-center" style={{ background: `linear-gradient(160deg, ${role.color ?? '#3a2a7a'}55, #1b1340)`, border: `3px solid ${role.color ?? '#ffb938'}` }}>
      <div className="space-y-3">
        <div className="text-sm opacity-80">{ar ? 'الكلمة السرية' : 'The secret word'}</div>
        <div className="bk-chip mx-auto" style={{ background: `${role.color}33`, color: role.color }}>{role.emoji} {ar ? role.category_ar : role.category_en}</div>
        <div className="rounded-2xl bg-white px-4 py-3 font-display text-4xl text-bk-900 shadow-xl">{ar ? role.word_ar : role.word_en || role.word_ar}</div>
        <p className="text-sm opacity-85">{ar ? 'جاوب بذكاء من غير ما تكشف الكلمة للبِكس!' : 'Answer cleverly without giving the word away!'}</p>
      </div>
    </div>
  )
}

/** Private scratch card: the role is fetched only for this player. */
export function RoleCard({ roomId }: { roomId: string }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [role, setRole] = useState<BakasaRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => { myRole(roomId).then(setRole).catch((e) => setError(bakasaError(e, ar))) }, [roomId, ar])
  if (error) return <p role="alert" className="text-center text-[#ff9b9b]">{error}</p>
  if (!role) return <p role="status" className="text-center">{ar ? 'بنجهّز كارتك…' : 'Preparing your card…'}</p>
  if (!role.in_round) return <p className="bk-panel text-center">👀 {ar ? 'انت متفرج في الجولة دي. هتلعب من الجولة الجاية!' : 'You are watching this round. You will play next round!'}</p>
  if (hidden) return <button type="button" className="bk-btn-ghost mx-auto flex" onClick={() => setHidden(false)}>👁️ {ar ? 'اعرض كارتي تاني' : 'Show my card again'}</button>
  return (
    <div className="space-y-3">
      <ScratchCard onReveal={() => { markSeen(roomId).catch(() => undefined) }}><RoleFace role={role} ar={ar} /></ScratchCard>
      <button type="button" className="bk-btn-ghost mx-auto flex" onClick={() => setHidden(true)}>🙈 {ar ? 'خبّي كارتي' : 'Hide my card'}</button>
    </div>
  )
}

export function RevealPhase({ state }: { state: BakasaState }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  return (
    <div className="space-y-4 text-center">
      <h2 className="bk-title text-3xl">{ar ? 'امسك موبايلك واخربش الكارت!' : 'Scratch your card!'}</h2>
      <p className="text-sm opacity-80">{ar ? 'تحت الكارت يا "أنت البِكس" يا الكلمة السرية 🤫' : 'Under the foil: "You are the spy" or the secret word 🤫'}</p>
      <RoleCard roomId={state.room.id} />
      <p className="text-sm opacity-70">{ar ? 'أول ما الكل يشوف كارته، فترة الأسئلة هتبدأ.' : 'Questions start once everyone has seen their card.'}</p>
    </div>
  )
}

function PeekButton({ roomId }: { roomId: string }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [role, setRole] = useState<BakasaRole | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { if (open && !role) myRole(roomId).then(setRole).catch(() => undefined) }, [open, role, roomId])
  return (
    <>
      <button type="button" className="bk-btn-ghost text-sm" onPointerDown={() => setOpen(true)} onPointerUp={() => setOpen(false)} onPointerLeave={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setOpen(true) }} onKeyUp={() => setOpen(false)}>👁️ {ar ? 'اضغط مطوّل لتشوف كارتك' : 'Hold to peek at your card'}</button>
      {open && role?.in_round && <div className="fixed inset-x-4 bottom-24 z-30 mx-auto h-72 max-w-xs"><RoleFace role={role} ar={ar} /></div>}
    </>
  )
}

export function DiscussionPhase({ state, turnLeft, reload }: { state: BakasaState; turnLeft: number | null; reload: () => Promise<void> }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const players = usePlayers(state)
  const round = state.round!
  const isHost = state.room.host_id === state.me
  const asker = round.current_turn ? players.get(round.current_turn) : undefined
  const target = round.current_target ? players.get(round.current_target) : undefined
  const iAsk = round.current_turn === state.me, iAnswer = round.current_target === state.me
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [round.messages.length])
  useEffect(() => { if (iAsk || iAnswer) playSound('turn') }, [iAsk, iAnswer, round.current_turn])
  useEffect(() => { setText('') }, [round.current_turn, round.pair_has_question])
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { setError(bakasaError(e, ar)) } setBusy(false) }
  const lapSize = round.turn_order.length
  const lapProgress = Math.min(lapSize, round.messages.filter((m) => m.kind === 'ANSWER').length % (lapSize || 1))

  if (round.questions_done) {
    return (
      <div className="space-y-4 text-center">
        <section className="bk-panel bk-pop space-y-3">
          <div className="text-5xl">⏸️</div>
          <h2 className="bk-title text-3xl">{ar ? 'انتهت فترة الأسئلة' : 'Question time is over'}</h2>
          <p className="opacity-80">{ar ? 'نكمّل أسئلة ولا نروح على التصويت؟' : 'More questions or go to the vote?'}</p>
          {isHost ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="bk-btn-ghost" disabled={busy} onClick={() => void run(() => moreQuestions(state.room.id))}>💬 {ar ? 'تكملة الأسئلة' : 'More questions'}</button>
              <button type="button" className="bk-btn" disabled={busy} onClick={() => void run(() => advance(state.room.id, true))}>🗳️ {ar ? 'التصويت' : 'Vote'}</button>
            </div>
          ) : <p className="text-sm opacity-75" role="status">{ar ? 'المضيف بيختار…' : 'The host is choosing…'}</p>}
        </section>
        {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3">{error}</p>}
        <PeekButton roomId={state.room.id} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="bk-panel bk-pop space-y-3 text-center" aria-live="polite">
        <div className="text-xs opacity-70">{ar ? `فترة الأسئلة ${round.q_lap} · سؤال ${lapProgress + 1} من ${lapSize}` : `Questions round ${round.q_lap} · ${lapProgress + 1} of ${lapSize}`}</div>
        <div className="flex items-center justify-center gap-3">
          {asker && <div className="flex flex-col items-center gap-1"><Avatar avatar={asker.avatar} size={64} ring="#ffb938" badge="🎤" /><b className="text-sm">{asker.nickname}</b></div>}
          <span className="text-3xl" aria-hidden="true">{ar ? '⬅️' : '➡️'}</span>
          {target && <div className="flex flex-col items-center gap-1"><Avatar avatar={target.avatar} size={64} ring="#3dc5ff" badge="❓" /><b className="text-sm">{target.nickname}</b></div>}
        </div>
        <h2 className="font-display text-2xl text-bk-accent">{asker && target ? (ar ? `${asker.nickname}، اسأل ${target.nickname}!` : `${asker.nickname}, ask ${target.nickname}!`) : '…'}</h2>
        <p className="text-sm opacity-75">{iAsk ? (ar ? 'دورك تسأل! حاول تعرف إذا كان هو البِكس.' : 'Your turn to ask! Try to find out if they are the spy.')
          : iAnswer ? (ar ? 'هيسألك دلوقتي… جاوب من غير ما تكشف الكلمة.' : 'You are being asked… answer without giving the word away.')
          : (ar ? 'ركّز في السؤال والإجابة… مين شكله مش عارف الكلمة؟' : 'Listen closely… who doesn’t seem to know the word?')}</p>
        {turnLeft !== null && <span className={`bk-chip ${turnLeft <= 10 ? 'bk-pulse bg-[#ff5d5d]' : 'bg-white/10'}`} dir="ltr">⏱ {turnLeft}s</span>}
      </section>

      {(iAsk && !round.pair_has_question) || (iAnswer && round.pair_has_question) ? (
        <form className="bk-panel bk-pop space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void run(() => postClue(state.room.id, text.trim())) }}>
          {iAsk && <div className="flex flex-wrap gap-2">{QUESTION_PROMPTS.map(([a, en]) => <button key={a} type="button" className="bk-chip bg-white/10 hover:bg-white/20" onClick={() => setText(ar ? a : en)}>{ar ? a : en}</button>)}</div>}
          <div className="flex gap-2">
            <input className="bk-input" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} autoFocus
              placeholder={iAsk ? (ar ? `اكتب سؤالك لـ ${target?.nickname ?? ''}…` : `Your question for ${target?.nickname ?? ''}…`) : (ar ? 'اكتب إجابتك…' : 'Your answer…')} aria-label={iAsk ? (ar ? 'سؤالك' : 'Your question') : (ar ? 'إجابتك' : 'Your answer')} />
            <button className="bk-btn shrink-0" type="submit" disabled={busy || !text.trim()}>{ar ? 'ابعت' : 'Send'}</button>
          </div>
        </form>
      ) : null}
      {(iAsk || iAnswer || isHost) && <button type="button" className="bk-btn-ghost w-full text-sm" disabled={busy} onClick={() => void run(() => pairDone(state.room.id))}>
        ✅ {ar ? 'سألنا بالكلام – اللي بعده' : 'We asked out loud – next'}</button>}
      {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}

      <section className="bk-panel max-h-[40vh] space-y-2 overflow-y-auto" aria-label={ar ? 'الأسئلة والإجابات' : 'Questions and answers'} aria-live="polite">
        {round.messages.length === 0 && <p className="text-center text-sm opacity-60">{ar ? 'لسه محدش سأل… 🤐' : 'No questions yet… 🤐'}</p>}
        {round.messages.map((m) => {
          const p = players.get(m.user_id), to = m.target ? players.get(m.target) : undefined, mine = m.user_id === state.me
          return (
            <div key={m.id} className={`bk-pop flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {p && <Avatar avatar={p.avatar} size={32} />}
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${m.kind === 'ANSWER' ? 'bg-bk-cyan/20' : mine ? 'bg-bk-accent text-bk-900' : 'bg-white/10'}`}>
                <div className="text-[11px] font-bold opacity-70">{p?.nickname}{to ? (m.kind === 'QUESTION' ? (ar ? ` ← يسأل ${to.nickname}` : ` → asks ${to.nickname}`) : (ar ? ' يجاوب' : ' answers')) : ''}</div>
                <div>{m.kind === 'QUESTION' ? '❓ ' : m.kind === 'ANSWER' ? '💬 ' : ''}{m.body}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </section>

      <div className="flex flex-wrap justify-center gap-2">
        {round.in_round && <PeekButton roomId={state.room.id} />}
        {isHost && <button type="button" className="bk-btn-ghost text-sm" disabled={busy} onClick={() => void run(() => skipTurn(state.room.id))}>⏭ {ar ? 'تخطي' : 'Skip'}</button>}
        {isHost && <button type="button" className="bk-btn-ghost text-sm" disabled={busy} onClick={() => void run(() => advance(state.room.id, true))}>🗳️ {ar ? 'يلا على التصويت' : 'Go to voting'}</button>}
      </div>
    </div>
  )
}

export function VotingPhase({ state, reload }: { state: BakasaState; reload: () => Promise<void> }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const round = state.round!
  const isHost = state.room.host_id === state.me
  const candidates = state.players.filter((p) => round.turn_order.includes(p.user_id) && p.status === 'ACTIVE' && p.user_id !== state.me)
  const [choice, setChoice] = useState<string | null>(round.my_vote)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setChoice(round.my_vote) }, [round.my_vote])
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { setError(bakasaError(e, ar)) } setBusy(false) }
  const locked = !!round.my_vote && !state.room.settings.allow_vote_change
  const pct = round.voters_total ? (round.votes_cast / round.voters_total) * 100 : 0
  return (
    <div className="space-y-4">
      <h2 className="bk-title text-center text-3xl">{ar ? 'مين شاكك إنه البِكس؟' : 'Who do you think is the spy?'}</h2>
      <p className="text-center text-sm opacity-80">{ar ? 'تصويتك سري ولوحدك. لو صوّت صح هتاخد +2 🎯' : 'Your vote is secret. Vote right and earn +2 🎯'}</p>
      <section className="bk-panel space-y-2">
        <div className="flex justify-between text-sm"><span>{ar ? 'صوّتوا' : 'Voted'}</span><span dir="ltr">{round.votes_cast}/{round.voters_total}</span></div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <p className="text-center text-sm" role="status">{!round.in_round ? (ar ? 'انت متفرج في الجولة دي' : 'You are watching this round')
          : round.my_vote ? (ar ? 'تم تسجيل تصويتك ✅ – بانتظار باقي اللاعبين' : 'Vote recorded ✅ – waiting for others') : (ar ? 'في انتظار تصويتك' : 'Waiting for your vote')}</p>
      </section>
      {round.in_round && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={ar ? 'اختار المشتبه فيه' : 'Choose a suspect'}>
          {candidates.map((p) => {
            const on = choice === p.user_id
            return (
              <li key={p.user_id}>
                <button type="button" role="radio" aria-checked={on} disabled={locked || busy} onClick={() => setChoice(p.user_id)}
                  className={`flex w-full flex-col items-center gap-2 rounded-3xl p-3 transition ${on ? 'scale-105 bg-[#ff5d5d]/25 ring-4 ring-[#ff5d5d]' : 'bg-white/5 hover:bg-white/10'}`}>
                  <Avatar avatar={p.avatar} size={64} badge={on ? '🎯' : undefined} />
                  <span className="w-full truncate font-semibold">{p.nickname}</span>
                  {round.my_vote === p.user_id && <span className="text-xs text-bk-lime">{ar ? 'صوتك' : 'Your vote'}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
      {round.in_round && !locked && (
        <button type="button" className="bk-btn w-full" disabled={!choice || busy || choice === round.my_vote}
          onClick={() => choice && void run(async () => { await castVote(state.room.id, choice); playSound('vote') })}>
          {round.my_vote ? (ar ? 'غيّر صوتي' : 'Change my vote') : (ar ? 'أكّد التصويت 🗳️' : 'Confirm vote 🗳️')}</button>
      )}
      {isHost && <button type="button" className="bk-btn-ghost w-full text-sm" disabled={busy} onClick={() => void run(() => advance(state.room.id, true))}>🔒 {ar ? 'اقفل التصويت دلوقتي' : 'Close voting now'}</button>}
    </div>
  )
}

export function GuessPhase({ state, reload }: { state: BakasaState; reload: () => Promise<void> }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [role, setRole] = useState<BakasaRole | null>(null)
  const [options, setOptions] = useState<WordOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { playSound('reveal'); myRole(state.room.id).then(setRole).catch(() => setRole({ in_round: false })) }, [state.room.id])
  useEffect(() => { if (role?.is_spy) guessOptions(state.room.id).then(setOptions).catch((e) => setError(bakasaError(e, ar))) }, [role, state.room.id, ar])
  const round = state.round!
  return (
    <div className="space-y-4 text-center">
      <h2 className="bk-title text-3xl">{ar ? 'التصويت خلص! 🗳️' : 'Voting is over! 🗳️'}</h2>
      {role?.is_spy && !done ? (
        <section className="bk-panel space-y-3">
          <div className="text-5xl">🕵️</div>
          <p className="text-lg font-semibold">{ar ? 'دورك يا بِكس! تقدر تعرف الكلمة؟ (+3 لو صح)' : 'Your turn, spy! Can you guess the word? (+3 if right)'}</p>
          {!options && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options?.map((o) => (
              <button key={o.id} type="button" className="bk-btn-ghost" disabled={busy}
                onClick={async () => { setBusy(true); try { const r = await spyGuess(state.room.id, o.id); setDone(true); playSound(r.correct ? 'win' : 'lose'); await reload() } catch (e) { setError(bakasaError(e, ar)); setBusy(false) } }}>
                {ar ? o.word_ar : o.word_en || o.word_ar}</button>
            ))}
          </div>
          {error && <p role="alert" className="text-[#ff9b9b]">{error}</p>}
        </section>
      ) : (
        <p className="bk-panel bk-pulse" role="status">🤔 {ar ? `البِكس بيحاول يخمّن الكلمة… (${round.guessed_count}/${round.spies_total})` : `The spy is guessing the word… (${round.guessed_count}/${round.spies_total})`}</p>
      )}
    </div>
  )
}

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 1.2, dur: 2.5 + Math.random() * 2,
    color: ['#ffb938', '#ff6fa8', '#3dc5ff', '#7bd96a', '#c77dff'][i % 5] })), [])
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  return <div className="bk-confetti" aria-hidden="true">{pieces.map((p, i) => <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />)}</div>
}

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (to === 0) { setV(0); return }
    let i = 0; const id = window.setInterval(() => { i += 1; setV(Math.min(to, i)); if (i >= to) window.clearInterval(id) }, 120)
    return () => window.clearInterval(id)
  }, [to])
  return <>{v}</>
}

export function ResultsPhase({ state, reload, onLeave }: { state: BakasaState; reload: () => Promise<void>; onLeave: () => void }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const players = usePlayers(state)
  const rv = state.round?.reveal
  const isHost = state.room.host_id === state.me
  const finished = state.room.status === 'FINISHED'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState(0)
  useEffect(() => {
    setStage(0)
    const t1 = window.setTimeout(() => setStage(1), 900), t2 = window.setTimeout(() => setStage(2), 2000)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [state.round?.id])
  const myDelta = rv?.score_deltas[state.me] ?? 0
  useEffect(() => { if (stage === 2 && rv && rv.winner !== 'ABANDONED') playSound(myDelta > 0 ? 'win' : 'lose') }, [stage, rv, myDelta])
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { setError(bakasaError(e, ar)) } setBusy(false) }
  if (!rv) return null
  const ranking = [...state.players].filter((p) => p.status === 'ACTIVE' || (rv.score_deltas[p.user_id] ?? 0) > 0).sort((a, b) => b.score - a.score)
  const maxVotes = Math.max(1, ...Object.values(rv.votes))
  const spyNames = rv.spy_ids.map((id) => players.get(id)?.nickname ?? '?').join('، ')
  const anyGuess = Object.values(rv.guesses ?? {}).some((g) => g.correct)
  const headline = rv.winner === 'ABANDONED' ? (ar ? 'الجولة اتلغت' : 'Round cancelled')
    : anyGuess ? (ar ? 'البِكس عرف الكلمة! 🤯' : 'The spy guessed the word! 🤯')
    : rv.spy_caught ? (ar ? 'تم كشف البِكس! 🎉' : 'The spy is unmasked! 🎉')
    : (ar ? 'البِكس قدر يخدعكم! 😈' : 'The spy fooled you! 😈')
  return (
    <div className="space-y-4">
      {stage === 2 && myDelta > 0 && <Confetti />}
      <section className="bk-panel bk-spotlight space-y-3 text-center">
        <p className="text-sm opacity-75">{ar ? `نتيجة الجولة ${state.round?.round_no} من ${state.room.settings.rounds}` : `Round ${state.round?.round_no} of ${state.room.settings.rounds}`}</p>
        <h2 className={`bk-title text-3xl ${stage >= 2 ? 'bk-pop' : 'opacity-0'}`}>{headline}</h2>
        <div className={`flex justify-center gap-4 transition duration-700 ${stage >= 1 ? 'opacity-100' : 'opacity-0'}`}>
          {rv.spy_ids.map((id) => { const p = players.get(id); const g = rv.guesses?.[id]; return p && (
            <div key={id} className="bk-pop space-y-1"><Avatar avatar={p.avatar} size={84} ring="#ff6fa8" badge="🕵️" /><div className="font-semibold">{p.nickname}</div>
              {g && <div className="text-xs">{ar ? 'خمّن: ' : 'Guessed: '}<b>{ar ? g.word_ar : g.word_en || g.word_ar}</b> {g.correct ? '✅' : '❌'}</div>}
              {!g && <div className="text-xs opacity-70">{ar ? 'ما خمّنش' : 'No guess'}</div>}</div>) })}
        </div>
        <p className={stage >= 1 ? '' : 'opacity-0'}>{ar ? `البِكس كان: ${spyNames}` : `The spy was: ${spyNames}`}</p>
        <div className="mx-auto w-fit rounded-2xl bg-white px-6 py-2 font-display text-3xl text-bk-900">{state.round?.emoji} {ar ? rv.word_ar : rv.word_en || rv.word_ar}</div>
        {rv.winner !== 'ABANDONED' && <p className={`text-lg font-bold ${myDelta > 0 ? 'text-bk-lime' : 'text-[#ff9b9b]'}`} dir="auto">{myDelta > 0 ? (ar ? `كسبت +${myDelta} نقطة! 🏆` : `You earned +${myDelta}! 🏆`) : (ar ? 'ما خدتش نقط الجولة دي' : 'No points this round')}</p>}
      </section>

      {Object.keys(rv.ballots ?? {}).length > 0 && (
        <section className="bk-panel space-y-2" aria-label={ar ? 'مين صوّت لمين' : 'Who voted for whom'}>
          <h3 className="font-semibold">🗳️ {ar ? 'مين صوّت لمين' : 'Who voted for whom'}</h3>
          {Object.entries(rv.ballots).map(([voter, suspect]) => { const v = players.get(voter), s = players.get(suspect); const right = rv.spy_ids.includes(suspect)
            return <div key={voter} className="flex items-center gap-2 text-sm">
              {v && <Avatar avatar={v.avatar} size={26} />}<span className="w-20 truncate">{v?.nickname}</span><span aria-hidden="true">{ar ? '←' : '→'}</span>
              {s && <Avatar avatar={s.avatar} size={26} />}<span className="flex-1 truncate">{s?.nickname}</span><span>{right ? '✅ +2' : '❌'}</span></div> })}
          <div className="space-y-1 pt-2">
            {Object.entries(rv.votes).sort((a, b) => b[1] - a[1]).map(([id, n]) => { const p = players.get(id); return (
              <div key={id} className="flex items-center gap-2"><span className="w-20 truncate text-xs">{p?.nickname}</span>
                <div className="progress-track flex-1"><div className="progress-fill" style={{ width: `${(n / maxVotes) * 100}%`, background: rv.spy_ids.includes(id) ? '#ff6fa8' : undefined }} /></div>
                <span className="w-6 text-end text-sm font-bold">{n}</span></div>) })}
          </div>
        </section>
      )}

      <section className="bk-panel space-y-2" aria-label={ar ? 'النقاط' : 'Scores'}>
        <h3 className="font-semibold">{finished ? (ar ? '🏆 الترتيب النهائي' : '🏆 Final standings') : (ar ? '📊 الـ Score بعد الجولة' : '📊 Score after this round')}</h3>
        <ol className="space-y-2">
          {ranking.map((p: BakasaPlayer, i) => (
            <li key={p.user_id} className={`flex items-center gap-3 rounded-2xl p-2 ${p.user_id === state.me ? 'bg-bk-accent/15' : 'bg-white/5'} ${finished && i === 0 ? 'ring-2 ring-bk-accent' : ''}`}>
              <span className="w-6 text-center text-lg">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
              <Avatar avatar={p.avatar} size={36} badge={rv.spy_ids.includes(p.user_id) ? '🕵️' : undefined} />
              <span className="flex-1 truncate font-semibold">{p.nickname}</span>
              {(rv.score_deltas[p.user_id] ?? 0) > 0 && <span className="bk-chip bg-bk-lime/20 text-bk-lime" dir="ltr">+{rv.score_deltas[p.user_id]}</span>}
              <span className="w-10 text-end font-display text-xl text-bk-accent"><CountUp to={p.score} /></span>
            </li>
          ))}
        </ol>
        <p className="text-xs opacity-60">{ar ? 'النقاط: صوت صح +2 · البِكس +1 عن كل لاعب ما اكتشفهوش · تخمين الكلمة +3' : 'Points: right vote +2 · spy +1 per fooled player · guessing the word +3'}</p>
      </section>

      {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
      <div className="grid gap-2">
        {isHost && !finished && <button type="button" className="bk-btn" disabled={busy} onClick={() => void run(() => startRound(state.room.id))}>▶ {ar ? 'الجولة الجاية' : 'Next round'}</button>}
        {isHost && <button type="button" className={finished ? 'bk-btn' : 'bk-btn-ghost'} disabled={busy} onClick={() => void run(() => rematch(state.room.id))}>🔁 {ar ? 'العب تاني (مباراة جديدة)' : 'Play again (rematch)'}</button>}
        {!isHost && <p className="text-center text-sm opacity-75" role="status">{ar ? 'مستنيين المضيف يكمّل…' : 'Waiting for the host…'}</p>}
        <button type="button" className="bk-btn-ghost" onClick={onLeave}>🚪 {ar ? 'اخرج من الغرفة' : 'Leave room'}</button>
      </div>
    </div>
  )
}

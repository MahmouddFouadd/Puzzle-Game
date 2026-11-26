import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { advance, bakasaError, castVote, guessOptions, myRole, postClue, rematch, skipTurn, spyGuess, startRound,
  type BakasaPlayer, type BakasaRole, type BakasaState, type WordOption } from './api'
import { Avatar, playSound } from './ui'

const QUESTION_PROMPTS = [
  ['بتلاقيه فين غالبًا؟', 'Where do you usually find it?'], ['بتستخدمه إمتى؟', 'When do you use it?'], ['لونه إيه في الغالب؟', 'What colour is it usually?'],
  ['حجمه كبير ولا صغير؟', 'Is it big or small?'], ['بتحبه؟ ليه؟', 'Do you like it? Why?'], ['ينفع يتاكل؟', 'Can you eat it?']
]

function usePlayers(state: BakasaState) {
  return useMemo(() => new Map(state.players.map((p) => [p.user_id, p])), [state.players])
}

/** Private role card. The role is fetched only for this player and is hidden again when they tap "hide". */
export function RoleCard({ roomId, autoOpen }: { roomId: string; autoOpen?: boolean }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [role, setRole] = useState<BakasaRole | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reveal = async () => {
    setError(null)
    try { const r = await myRole(roomId); setRole(r); setOpen(true); playSound('reveal') } catch (e) { setError(bakasaError(e, ar)) }
  }
  useEffect(() => { if (autoOpen === false) setOpen(false) }, [autoOpen])
  if (role && !role.in_round) return <p className="bk-panel text-center">👀 {ar ? 'انت متفرج في الجولة دي. هتلعب من الجولة الجاية!' : 'You are watching this round. You will play next round!'}</p>
  return (
    <div className="space-y-3">
      <div className={`bk-flip mx-auto h-72 w-full max-w-xs ${open ? 'is-open' : ''}`}>
        <div className="bk-flip-inner">
          <button type="button" onClick={() => void reveal()} className="bk-face bk-card-back" aria-label={ar ? 'اكشف دورك' : 'Reveal your role'} disabled={open}>
            <div className="space-y-3"><div className="text-6xl">🃏</div><div className="font-display text-2xl text-bk-accent">{ar ? 'اكشف دورك' : 'Reveal your role'}</div>
              <div className="text-xs opacity-70">{ar ? 'خبّي الشاشة عن اللي جنبك 🤫' : 'Hide the screen from others 🤫'}</div></div>
          </button>
          <div className="bk-face bk-face-back" style={{ background: role?.is_spy ? 'radial-gradient(circle at 50% 30%, #5a1d6e, #1b1340)' : `linear-gradient(160deg, ${role?.color ?? '#3a2a7a'}55, #1b1340)`, border: `3px solid ${role?.is_spy ? '#ff6fa8' : role?.color ?? '#ffb938'}` }}>
            {role && (role.is_spy ? (
              <div className="space-y-3" aria-live="polite">
                <div className="text-6xl">🕵️</div>
                <div className="font-display text-3xl text-bk-pink">{ar ? 'أنت البِكس!' : 'You are the spy!'}</div>
                <div className="bk-chip mx-auto bg-white/10">{role.emoji} {ar ? role.category_ar : role.category_en}</div>
                <p className="text-sm opacity-85">{ar ? 'حاول تفهم الكلمة من كلام باقي اللاعبين من غير ما حد يكشفك!' : 'Figure out the word from the others without getting caught!'}</p>
              </div>
            ) : (
              <div className="space-y-3" aria-live="polite">
                <div className="text-sm opacity-80">{ar ? 'أنت لاعب عادي' : 'You are a regular player'}</div>
                <div className="bk-chip mx-auto" style={{ background: `${role.color}33`, color: role.color }}>{role.emoji} {ar ? role.category_ar : role.category_en}</div>
                <div className="rounded-2xl bg-white px-4 py-3 font-display text-4xl text-bk-900 shadow-xl">{ar ? role.word_ar : role.word_en || role.word_ar}</div>
                <p className="text-sm opacity-85">{ar ? 'خلي إجاباتك ذكية من غير ما تكشف الكلمة!' : 'Answer cleverly without giving the word away!'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="text-center text-[#ff9b9b]">{error}</p>}
      {open && <button type="button" className="bk-btn-ghost mx-auto flex" onClick={() => setOpen(false)}>🙈 {ar ? 'خبّي دوري' : 'Hide my role'}</button>}
    </div>
  )
}

export function RevealPhase({ state }: { state: BakasaState }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  return (
    <div className="space-y-4 text-center">
      <h2 className="bk-title text-3xl">{ar ? 'استعد… دورك السري جاهز!' : 'Get ready… your secret role is here!'}</h2>
      <RoleCard roomId={state.room.id} />
      <p className="text-sm opacity-70">{ar ? 'أول ما الكل يشوف دوره، النقاش هيبدأ.' : 'Discussion starts once everyone has seen their role.'}</p>
    </div>
  )
}

function TurnStrip({ state }: { state: BakasaState }) {
  const players = usePlayers(state)
  const order = state.round?.turn_order ?? []
  const current = state.round?.current_turn
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => { ref.current?.querySelector('[data-active="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }) }, [current])
  return (
    <ol ref={ref} className="flex gap-3 overflow-x-auto pb-2" aria-label="turn order">
      {order.map((id) => {
        const p = players.get(id)
        if (!p) return null
        const active = id === current
        return (
          <li key={id} data-active={active} className={`flex w-16 shrink-0 flex-col items-center gap-1 transition ${active ? 'scale-110' : 'opacity-75'}`}>
            <Avatar avatar={p.avatar} size={48} ring={active ? '#ffb938' : undefined} dim={p.status !== 'ACTIVE' || !p.online} badge={active ? '🎤' : undefined} />
            <span className={`w-full truncate text-center text-xs ${active ? 'font-bold text-bk-accent' : ''}`}>{p.nickname}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function DiscussionPhase({ state, turnLeft, reload }: { state: BakasaState; turnLeft: number | null; reload: () => Promise<void> }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const players = usePlayers(state)
  const round = state.round!
  const myTurn = round.current_turn === state.me
  const isHost = state.room.host_id === state.me
  const current = round.current_turn ? players.get(round.current_turn) : undefined
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peek, setPeek] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [round.messages.length])
  useEffect(() => { if (myTurn) playSound('turn') }, [myTurn])
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { setError(bakasaError(e, ar)) } setBusy(false) }
  const totalTurns = round.turn_order.length * state.room.settings.clue_laps
  return (
    <div className="space-y-4">
      <section className="bk-panel space-y-3">
        <TurnStrip state={state} />
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/5 p-3" aria-live="polite">
          <div className="flex items-center gap-2">
            {current && <Avatar avatar={current.avatar} size={36} />}
            <span className="font-semibold">{myTurn ? (ar ? 'دورك! اسأل أو ادّي تلميح' : 'Your turn! Ask or give a clue') : (ar ? `دور ${current?.nickname ?? '…'}` : `${current?.nickname ?? '…'}'s turn`)}</span>
          </div>
          {turnLeft !== null && <span className={`bk-chip ${turnLeft <= 10 ? 'bk-pulse bg-[#ff5d5d]' : 'bg-white/10'}`} dir="ltr">⏱ {turnLeft}s</span>}
        </div>
        <div className="text-xs opacity-70">{ar ? `تلميح ${Math.min(round.messages.length + 1, totalTurns)} من ${totalTurns}` : `Clue ${Math.min(round.messages.length + 1, totalTurns)} of ${totalTurns}`}</div>
      </section>

      <section className="bk-panel max-h-[45vh] space-y-2 overflow-y-auto" aria-label={ar ? 'التلميحات' : 'Clues'} aria-live="polite">
        {round.messages.length === 0 && <p className="text-center text-sm opacity-60">{ar ? 'لسه محدش قال حاجة… 🤐' : 'No clues yet… 🤐'}</p>}
        {round.messages.map((m) => {
          const p = players.get(m.user_id); const mine = m.user_id === state.me
          return (
            <div key={m.id} className={`bk-pop flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {p && <Avatar avatar={p.avatar} size={32} />}
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${mine ? 'bg-bk-accent text-bk-900' : 'bg-white/10'}`}>
                <div className="text-[11px] font-bold opacity-70">{p?.nickname}</div><div>{m.body}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </section>

      {myTurn && round.in_round && (
        <form className="bk-panel bk-pop space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void run(async () => { await postClue(state.room.id, text.trim()); setText('') }) }}>
          <div className="flex flex-wrap gap-2">{QUESTION_PROMPTS.map(([a, en]) => (
            <button key={a} type="button" className="bk-chip bg-white/10 hover:bg-white/20" onClick={() => setText(ar ? a : en)}>{ar ? a : en}</button>))}</div>
          <div className="flex gap-2">
            <input className="bk-input" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder={ar ? 'اكتب سؤالك أو تلميحك…' : 'Type your question or clue…'} aria-label={ar ? 'تلميحك' : 'Your clue'} autoFocus />
            <button className="bk-btn shrink-0" type="submit" disabled={busy || !text.trim()}>{ar ? 'ابعت' : 'Send'}</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}

      <div className="flex flex-wrap justify-center gap-2">
        {round.in_round && <button type="button" className="bk-btn-ghost text-sm" onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setPeek(true) }} onKeyUp={() => setPeek(false)}>👁️ {ar ? 'اضغط مطوّل لتشوف دورك' : 'Hold to peek at your role'}</button>}
        {isHost && <button type="button" className="bk-btn-ghost text-sm" disabled={busy} onClick={() => void run(() => skipTurn(state.room.id))}>⏭ {ar ? 'تخطي الدور' : 'Skip turn'}</button>}
        {isHost && <button type="button" className="bk-btn-ghost text-sm" disabled={busy} onClick={() => void run(() => advance(state.room.id, true))}>🗳️ {ar ? 'يلا على التصويت' : 'Go to voting'}</button>}
      </div>
      {peek && <div className="fixed inset-x-4 bottom-24 z-30"><RoleCard roomId={state.room.id} /></div>}
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
  useEffect(() => { setChoice(round.my_vote) }, [round.my_vote, round.revote])
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { setError(bakasaError(e, ar)) } setBusy(false) }
  const locked = !!round.my_vote && !state.room.settings.allow_vote_change
  const pct = round.voters_total ? (round.votes_cast / round.voters_total) * 100 : 0
  return (
    <div className="space-y-4">
      <h2 className="bk-title text-center text-3xl">{ar ? 'مين شاكك إنه البِكس؟' : 'Who do you think is the spy?'}</h2>
      {round.revote > 0 && <p className="rounded-2xl bg-bk-cyan/20 p-3 text-center font-semibold" role="status">⚖️ {ar ? 'حصل تعادل! صوّتوا تاني.' : 'It was a tie! Vote again.'}</p>}
      <section className="bk-panel space-y-2">
        <div className="flex justify-between text-sm"><span>{ar ? 'التصويت' : 'Votes'}</span><span dir="ltr">{round.votes_cast}/{round.voters_total}</span></div>
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
  const players = usePlayers(state)
  const accused = state.round?.accused ? players.get(state.round.accused) : undefined
  const iAmAccused = state.round?.accused === state.me
  const [options, setOptions] = useState<WordOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { playSound('reveal'); if (iAmAccused) guessOptions(state.room.id).then(setOptions).catch((e) => setError(bakasaError(e, ar))) }, [iAmAccused, state.room.id, ar])
  return (
    <div className="space-y-4 text-center">
      <h2 className="bk-title text-3xl">{ar ? 'تم كشف البِكس! 🎯' : 'The spy is caught! 🎯'}</h2>
      {accused && <div className="bk-pop mx-auto w-fit space-y-2"><Avatar avatar={accused.avatar} size={96} ring="#ff6fa8" badge="🕵️" /><div className="font-display text-2xl">{accused.nickname}</div></div>}
      {iAmAccused ? (
        <section className="bk-panel space-y-3">
          <p className="text-lg font-semibold">{ar ? 'لسه عندك فرصة أخيرة… تقدر تعرف الكلمة؟' : 'One last chance… can you guess the word?'}</p>
          {!options && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
          <div className="grid grid-cols-2 gap-2">
            {options?.map((o) => (
              <button key={o.id} type="button" className="bk-btn-ghost text-lg" disabled={busy}
                onClick={async () => { setBusy(true); try { const r = await spyGuess(state.room.id, o.id); playSound(r.correct ? 'win' : 'lose'); await reload() } catch (e) { setError(bakasaError(e, ar)); setBusy(false) } }}>
                {ar ? o.word_ar : o.word_en || o.word_ar}</button>
            ))}
          </div>
          {error && <p role="alert" className="text-[#ff9b9b]">{error}</p>}
        </section>
      ) : (
        <p className="bk-panel bk-pulse" role="status">🤔 {ar ? `${accused?.nickname ?? 'البِكس'} بيحاول يخمّن الكلمة…` : `${accused?.nickname ?? 'The spy'} is trying to guess the word…`}</p>
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
  const amSpy = !!rv?.spy_ids.includes(state.me)
  const iWon = rv ? (rv.winner === 'SPY') === amSpy && rv.winner !== 'ABANDONED' : false
  useEffect(() => { if (stage === 2 && rv && rv.winner !== 'ABANDONED') playSound(iWon ? 'win' : 'lose') }, [stage, rv, iWon])
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { setError(bakasaError(e, ar)) } setBusy(false) }
  if (!rv) return null
  const ranking = [...state.players].filter((p) => p.status === 'ACTIVE' || (rv.score_deltas[p.user_id] ?? 0) > 0).sort((a, b) => b.score - a.score)
  const maxVotes = Math.max(1, ...Object.values(rv.votes))
  const spyNames = rv.spy_ids.map((id) => players.get(id)?.nickname ?? '?').join('، ')
  const headline = rv.winner === 'ABANDONED' ? (ar ? 'الجولة اتلغت' : 'Round cancelled')
    : !rv.spy_caught ? (ar ? 'البِكس قدر يخدعكم! 😈' : 'The spy fooled you! 😈')
    : rv.guess_correct ? (ar ? 'اتكشف… بس عرف الكلمة! 🤯' : 'Caught… but guessed the word! 🤯')
    : (ar ? 'تم كشف البِكس! 🎉' : 'The spy is unmasked! 🎉')
  return (
    <div className="space-y-4">
      {stage === 2 && iWon && <Confetti />}
      <section className="bk-panel bk-spotlight space-y-3 text-center">
        <p className="text-sm opacity-75">{ar ? `الجولة ${state.round?.round_no} من ${state.room.settings.rounds}` : `Round ${state.round?.round_no} of ${state.room.settings.rounds}`}</p>
        <h2 className={`bk-title text-3xl ${stage >= 2 ? 'bk-pop' : 'opacity-0'}`}>{headline}</h2>
        <div className={`flex justify-center gap-4 transition duration-700 ${stage >= 1 ? 'opacity-100' : 'opacity-0'}`}>
          {rv.spy_ids.map((id) => { const p = players.get(id); return p && (
            <div key={id} className="bk-pop space-y-1"><Avatar avatar={p.avatar} size={84} ring="#ff6fa8" badge="🕵️" /><div className="font-semibold">{p.nickname}</div></div>) })}
        </div>
        <p className={stage >= 1 ? '' : 'opacity-0'}>{ar ? `البِكس كان: ${spyNames}` : `The spy was: ${spyNames}`}</p>
        <div className="mx-auto w-fit rounded-2xl bg-white px-6 py-2 font-display text-3xl text-bk-900">{state.round?.emoji} {ar ? rv.word_ar : rv.word_en || rv.word_ar}</div>
        {rv.spy_caught && (rv.guess_ar || rv.guess_correct === false) && (
          <p className="text-sm">{ar ? 'تخمين البِكس: ' : "Spy's guess: "}<b>{ar ? rv.guess_ar ?? '—' : rv.guess_en || rv.guess_ar || '—'}</b> {rv.guess_correct ? '✅' : '❌'}</p>)}
        {rv.winner !== 'ABANDONED' && <p className={`text-lg font-bold ${iWon ? 'text-bk-lime' : 'text-[#ff9b9b]'}`}>{iWon ? (ar ? 'كسبت الجولة دي! 🏆' : 'You won this round! 🏆') : (ar ? 'خسرت الجولة دي' : 'You lost this round')}</p>}
      </section>

      {Object.keys(rv.votes).length > 0 && (
        <section className="bk-panel space-y-2" aria-label={ar ? 'نتيجة التصويت' : 'Vote results'}>
          <h3 className="font-semibold">🗳️ {ar ? 'نتيجة التصويت' : 'Votes'}</h3>
          {Object.entries(rv.votes).sort((a, b) => b[1] - a[1]).map(([id, n]) => { const p = players.get(id); return (
            <div key={id} className="flex items-center gap-2">
              {p && <Avatar avatar={p.avatar} size={28} />}<span className="w-24 truncate text-sm">{p?.nickname}</span>
              <div className="progress-track flex-1"><div className="progress-fill" style={{ width: `${(n / maxVotes) * 100}%`, background: rv.spy_ids.includes(id) ? '#ff6fa8' : undefined }} /></div>
              <span className="w-6 text-end font-bold">{n}</span>
            </div>) })}
        </section>
      )}

      <section className="bk-panel space-y-2" aria-label={ar ? 'النقاط' : 'Scores'}>
        <h3 className="font-semibold">{finished ? (ar ? '🏆 الترتيب النهائي' : '🏆 Final standings') : (ar ? '📊 النقاط' : '📊 Scores')}</h3>
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
        <p className="text-xs opacity-60">{ar ? `مدة الجولة: ${Math.round(rv.duration_seconds / 60)} دقيقة` : `Round time: ${Math.round(rv.duration_seconds / 60)} min`}</p>
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

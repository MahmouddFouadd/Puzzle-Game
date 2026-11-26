import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { bakasaError, localDeck, type LocalDeck } from '../../bakasa/api'
import { useCategories } from '../../bakasa/SettingsForm'
import { Avatar, AVATAR_KEYS, BakasaLogo, playSound, SoundToggle } from '../../bakasa/ui'
import { ScratchCard } from '../../bakasa/ScratchCard'
import { RoleFace } from '../../bakasa/Phases'

type Stage = 'setup' | 'pass' | 'scratch' | 'questions' | 'qdone' | 'vote-pass' | 'vote' | 'votes' | 'guess-pass' | 'guess' | 'result'
interface LocalPlayer { name: string; avatar: string; score: number }

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

/**
 * Pass-the-phone Bakasa, same rules as online:
 * scratch cards -> question pairs ("A, ask B") -> more questions or vote -> secret individual votes
 * -> every spy guesses the word from 12 options -> round score.
 * Scoring: right vote +2, spy +1 per fooled player, spy +3 for the word.
 */
export default function BakasaLocal() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const cats = useCategories()
  const [players, setPlayers] = useState<LocalPlayer[]>([{ name: '', avatar: 'fox', score: 0 }, { name: '', avatar: 'cat', score: 0 }, { name: '', avatar: 'owl', score: 0 }, { name: '', avatar: 'panda', score: 0 }])
  const [spyCount, setSpyCount] = useState(1)
  const [category, setCategory] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('setup')
  const [deck, setDeck] = useState<LocalDeck | null>(null)
  const [spies, setSpies] = useState<number[]>([])
  const [idx, setIdx] = useState(0)
  const [order, setOrder] = useState<number[]>([])
  const [lap, setLap] = useState(1)
  const [pairIdx, setPairIdx] = useState(0)
  const [votes, setVotes] = useState<Record<number, number>>({})
  const [pick, setPick] = useState<number | null>(null)
  const [guesses, setGuesses] = useState<Record<number, { word: string; correct: boolean }>>({})
  const [deltas, setDeltas] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const [scratched, setScratched] = useState(false)

  useEffect(() => {
    if (stage === 'setup' || stage === 'result') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [stage])

  const named = players.map((p, i) => ({ ...p, name: p.name.trim() || (ar ? `لاعب ${i + 1}` : `Player ${i + 1}`) }))
  const n = players.length
  const maxSpies = Math.max(1, Math.floor((n - 1) / 2))
  const off = ((lap - 1) % Math.max(1, n - 1)) + 1
  const asker = order[pairIdx], target = order[(pairIdx + off) % n]
  const guessers = useMemo(() => spies.filter((s) => !(s in guesses)), [spies, guesses])

  const start = async () => {
    setError(null)
    try {
      const d = await localDeck(category)
      setDeck(d); setSpies(shuffle(players.map((_, i) => i)).slice(0, Math.min(spyCount, maxSpies)))
      setOrder(shuffle(players.map((_, i) => i))); setIdx(0); setLap(1); setPairIdx(0)
      setVotes({}); setGuesses({}); setDeltas({}); setPick(null); setRound((r) => r + 1); setScratched(false)
      setStage('pass')
    } catch (e) { setError(bakasaError(e, ar)) }
  }
  const nextScratch = () => {
    setScratched(false)
    if (idx + 1 < n) { setIdx(idx + 1); setStage('pass') } else { setStage('questions'); setPairIdx(0); playSound('turn') }
  }
  const nextPair = () => { if (pairIdx + 1 < n) { setPairIdx(pairIdx + 1); playSound('turn') } else setStage('qdone') }
  const startVoting = () => { setIdx(0); setPick(null); setStage('vote-pass') }
  const castLocalVote = () => {
    if (pick === null) return
    const v = { ...votes, [idx]: pick }; setVotes(v); setPick(null); playSound('vote')
    if (idx + 1 < n) { setIdx(idx + 1); setStage('vote-pass') } else { setStage('votes'); playSound('reveal') }
  }
  const finishRound = (g: Record<number, { word: string; correct: boolean }>) => {
    const fooled = players.filter((_, i) => !spies.includes(i) && !spies.includes(votes[i])).length
    const d: Record<number, number> = {}
    players.forEach((_, i) => { d[i] = spies.includes(i) ? fooled + (g[i]?.correct ? 3 : 0) : (spies.includes(votes[i]) ? 2 : 0) })
    setDeltas(d); setPlayers((ps) => ps.map((p, i) => ({ ...p, score: p.score + (d[i] ?? 0) })))
    setStage('result'); playSound(Object.values(g).some((x) => x.correct) ? 'lose' : 'win')
  }
  const submitGuess = (wordId: string, word: string) => {
    const spy = guessers[0]
    const g = { ...guesses, [spy]: { word, correct: wordId === deck?.word_id } }
    setGuesses(g)
    if (guessers.length > 1) setStage('guess-pass'); else finishRound(g)
  }

  const shell = (children: React.ReactNode) => (
    <main className="bakasa"><div className="bk-shell space-y-4">
      <div className="flex items-center justify-between">
        {stage === 'setup' ? <Link to="/bakasa" className="bk-btn-ghost">{ar ? 'رجوع' : 'Back'}</Link>
          : <button type="button" className="bk-btn-ghost" onClick={() => { if (window.confirm(ar ? 'تنهي الجولة وترجع للإعدادات؟' : 'End the round and return to setup?')) setStage('setup') }}>{ar ? 'إنهاء' : 'End'}</button>}
        <div className="flex items-center gap-2">{round > 0 && <span className="bk-chip bg-white/10">{ar ? `الجولة ${round}` : `Round ${round}`}</span>}<SoundToggle /><BakasaLogo small /></div>
      </div>{children}</div></main>
  )
  const PassScreen = ({ who, title, action }: { who: number; title: string; action: string }) => (
    <section className="bk-panel bk-pop space-y-5 py-10 text-center">
      <div className="text-6xl">🤫</div>
      <p className="text-lg">{title}</p>
      <div className="mx-auto w-fit"><Avatar avatar={named[who].avatar} size={96} /></div>
      <h2 className="bk-title text-4xl">{named[who].name}</h2>
      <p className="text-sm opacity-75">{ar ? 'محدش يبص غيره!' : 'No peeking, everyone else!'}</p>
      <button type="button" className="bk-btn w-full" onClick={() => setStage(stage === 'pass' ? 'scratch' : stage === 'vote-pass' ? 'vote' : 'guess')}>{action}</button>
    </section>
  )

  if (stage === 'setup') return shell(<>
    <h1 className="bk-title text-3xl">📱 {ar ? 'العب على موبايل واحد' : 'Pass-the-phone'}</h1>
    <section className="bk-panel space-y-3">
      <h2 className="font-semibold">{ar ? 'اللاعبين' : 'Players'} ({n})</h2>
      {players.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <button type="button" aria-label={ar ? 'غيّر الشخصية' : 'Change avatar'} onClick={() => setPlayers((ps) => ps.map((x, j) => j === i ? { ...x, avatar: AVATAR_KEYS[(AVATAR_KEYS.indexOf(x.avatar) + 1) % AVATAR_KEYS.length] } : x))}><Avatar avatar={p.avatar} size={44} /></button>
          <input className="bk-input py-2" maxLength={20} value={p.name} placeholder={ar ? `لاعب ${i + 1}` : `Player ${i + 1}`} aria-label={ar ? `اسم لاعب ${i + 1}` : `Player ${i + 1} name`}
            onChange={(e) => setPlayers((ps) => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
          {n > 3 && <button type="button" className="bk-icon-btn" aria-label={ar ? 'احذف' : 'Remove'} onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))}>✖</button>}
        </div>
      ))}
      {n < 12 && <button type="button" className="bk-btn-ghost w-full" onClick={() => setPlayers((ps) => [...ps, { name: '', avatar: AVATAR_KEYS[ps.length % AVATAR_KEYS.length], score: 0 }])}>➕ {ar ? 'زوّد لاعب' : 'Add player'}</button>}
    </section>
    <section className="bk-panel space-y-3">
      <div className="flex items-center justify-between"><span>{ar ? 'عدد البِكس' : 'Spies'}</span>
        <div className="flex items-center gap-2"><button type="button" className="bk-icon-btn" onClick={() => setSpyCount(Math.max(1, spyCount - 1))}>−</button><b className="w-6 text-center">{Math.min(spyCount, maxSpies)}</b><button type="button" className="bk-icon-btn" onClick={() => setSpyCount(Math.min(maxSpies, spyCount + 1))}>+</button></div></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`bk-chip border-2 ${category === null ? 'border-bk-accent bg-bk-accent/20' : 'border-white/15'}`} onClick={() => setCategory(null)}>🎲 {ar ? 'عشوائي' : 'Random'}</button>
        {cats?.map((c) => <button key={c.id} type="button" className="bk-chip border-2" style={{ borderColor: category === c.id ? c.color : 'rgba(255,255,255,.15)', background: category === c.id ? `${c.color}33` : undefined }} onClick={() => setCategory(c.id)}>{c.emoji} {ar ? c.name_ar : c.name_en}</button>)}
      </div>
      <p className="text-xs opacity-70">{ar ? 'النقاط: صوت صح +2 · البِكس +1 عن كل لاعب ما اكتشفهوش · البِكس يعرف الكلمة +3' : 'Points: right vote +2 · spy +1 per fooled player · spy guesses the word +3'}</p>
    </section>
    {round > 0 && <section className="bk-panel"><h2 className="mb-2 font-semibold">{ar ? 'الـ Score' : 'Score'}</h2>{[...named].sort((a, b) => b.score - a.score).map((p, i) => <div key={i} className="flex justify-between"><span>{p.name}</span><b className="text-bk-accent">{p.score}</b></div>)}</section>}
    {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
    <button type="button" className="bk-btn w-full" onClick={() => void start()}>{round > 0 ? (ar ? 'الجولة الجاية ▶' : 'Next round ▶') : (ar ? 'يلا نوزّع الكروت ▶' : 'Deal cards ▶')}</button>
  </>)

  if (stage === 'pass') return shell(<PassScreen who={idx} title={ar ? 'سلّم الموبايل لـ' : 'Pass the phone to'} action={ar ? `أنا ${named[idx].name} – جاهز أخربش` : `I'm ${named[idx].name} – ready`} />)

  if (stage === 'scratch' && deck) {
    const isSpy = spies.includes(idx)
    return shell(
      <section className="space-y-4 text-center">
        <h2 className="bk-title text-3xl">{named[idx].name}، {ar ? 'اخربش كارتك!' : 'scratch your card!'}</h2>
        <ScratchCard onReveal={() => setScratched(true)}>
          <RoleFace role={{ is_spy: isSpy, word_ar: deck.word_ar, word_en: deck.word_en, category_ar: deck.category_ar, category_en: deck.category_en, emoji: deck.emoji, color: deck.color }} ar={ar} />
        </ScratchCard>
        {scratched && <button type="button" className="bk-btn w-full" onClick={nextScratch}>🙈 {idx + 1 < n ? (ar ? 'خبّيت الكارت – اللي بعده' : 'Hidden – next player') : (ar ? 'خبّيت الكارت – نبدأ الأسئلة' : 'Hidden – start questions')}</button>}
      </section>)
  }

  if (stage === 'questions') return shell(
    <section className="bk-panel bk-pop space-y-4 py-8 text-center" aria-live="polite">
      <p className="text-sm opacity-70">{ar ? `فترة الأسئلة ${lap} · ${pairIdx + 1} من ${n}` : `Questions round ${lap} · ${pairIdx + 1} of ${n}`}</p>
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1"><Avatar avatar={named[asker].avatar} size={80} ring="#ffb938" badge="🎤" /><b>{named[asker].name}</b></div>
        <span className="text-4xl" aria-hidden="true">{ar ? '⬅️' : '➡️'}</span>
        <div className="flex flex-col items-center gap-1"><Avatar avatar={named[target].avatar} size={80} ring="#3dc5ff" badge="❓" /><b>{named[target].name}</b></div>
      </div>
      <h2 className="bk-title text-3xl">{ar ? `${named[asker].name}، اسأل ${named[target].name}!` : `${named[asker].name}, ask ${named[target].name}!`}</h2>
      <p className="text-sm opacity-80">{ar ? 'اسأل سؤال عن الكلمة… وحاول تعرف هل هو البِكس.' : 'Ask about the word… and try to tell if they are the spy.'}</p>
      <button type="button" className="bk-btn w-full" onClick={nextPair}>{pairIdx + 1 < n ? (ar ? 'تم ✅ – السؤال اللي بعده' : 'Done ✅ – next question') : (ar ? 'تم ✅' : 'Done ✅')}</button>
      <button type="button" className="text-sm underline opacity-70" onClick={() => setStage('qdone')}>{ar ? 'خلّصوا الأسئلة بدري' : 'End questions early'}</button>
    </section>)

  if (stage === 'qdone') return shell(
    <section className="bk-panel bk-pop space-y-4 py-8 text-center">
      <div className="text-5xl">⏸️</div>
      <h2 className="bk-title text-3xl">{ar ? 'انتهت فترة الأسئلة' : 'Question time is over'}</h2>
      <p>{ar ? 'تكملة الأسئلة ولا التصويت؟' : 'More questions or vote?'}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="bk-btn-ghost" onClick={() => { setLap(lap + 1); setPairIdx(0); setStage('questions') }}>💬 {ar ? 'تكملة الأسئلة' : 'More questions'}</button>
        <button type="button" className="bk-btn" onClick={startVoting}>🗳️ {ar ? 'التصويت' : 'Vote'}</button>
      </div>
    </section>)

  if (stage === 'vote-pass') return shell(<PassScreen who={idx} title={ar ? 'دور تصويت' : 'Voting turn for'} action={ar ? `أنا ${named[idx].name} – هصوّت في السر` : `I'm ${named[idx].name} – vote in secret`} />)

  if (stage === 'vote') return shell(<>
    <h2 className="bk-title text-center text-3xl">{named[idx].name}، {ar ? 'مين البِكس في رأيك؟' : 'who is the spy?'}</h2>
    <p className="text-center text-sm opacity-80">{ar ? 'تصويتك سري. لو صح هتاخد +2' : 'Your vote is secret. Right = +2'}</p>
    <ul className="grid grid-cols-2 gap-3" role="radiogroup">{named.map((p, i) => i === idx ? null : (
      <li key={i}><button type="button" role="radio" aria-checked={pick === i} onClick={() => setPick(i)}
        className={`flex w-full flex-col items-center gap-2 rounded-3xl p-3 ${pick === i ? 'bg-[#ff5d5d]/25 ring-4 ring-[#ff5d5d]' : 'bg-white/5'}`}><Avatar avatar={p.avatar} size={60} /><span className="font-semibold">{p.name}</span></button></li>))}</ul>
    <button type="button" className="bk-btn w-full" disabled={pick === null} onClick={castLocalVote}>🗳️ {ar ? 'أكّد صوتي وخبّيه' : 'Confirm & hide my vote'}</button>
  </>)

  if (stage === 'votes') {
    const counts = new Map<number, number>(); Object.values(votes).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
    const max = Math.max(1, ...counts.values())
    return shell(<>
      <h2 className="bk-title text-center text-3xl">{ar ? 'نتيجة التصويت 🗳️' : 'Vote results 🗳️'}</h2>
      <section className="bk-panel space-y-2">
        {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([i, c]) => (
          <div key={i} className="flex items-center gap-2"><Avatar avatar={named[i].avatar} size={32} /><span className="w-24 truncate">{named[i].name}</span>
            <div className="progress-track flex-1"><div className="progress-fill" style={{ width: `${(c / max) * 100}%` }} /></div><b className="w-6 text-end">{c}</b></div>))}
      </section>
      <p className="text-center text-sm opacity-80">{ar ? 'دلوقتي البِكس يحاول يخمّن الكلمة…' : 'Now the spy tries to guess the word…'}</p>
      <button type="button" className="bk-btn w-full" onClick={() => setStage('guess-pass')}>🕵️ {ar ? 'دور البِكس' : "Spy's turn"}</button>
    </>)
  }

  if (stage === 'guess-pass' && guessers.length > 0) return shell(<PassScreen who={guessers[0]} title={ar ? 'سلّم الموبايل للبِكس:' : 'Hand the phone to the spy:'} action={ar ? 'أنا البِكس – هخمّن' : "I'm the spy – guess"} />)

  if (stage === 'guess' && deck && guessers.length > 0) return shell(
    <section className="bk-panel space-y-3 text-center">
      <div className="text-5xl">🕵️</div>
      <h2 className="font-display text-2xl">{named[guessers[0]].name}، {ar ? 'الكلمة كانت إيه؟ (+3 لو صح)' : 'what was the word? (+3 if right)'}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{deck.options.map((o) => (
        <button key={o.id} type="button" className="bk-btn-ghost" onClick={() => submitGuess(o.id, ar ? o.word_ar : o.word_en || o.word_ar)}>{ar ? o.word_ar : o.word_en || o.word_ar}</button>))}</div>
    </section>)

  if (stage === 'result' && deck) {
    const anyRight = Object.values(guesses).some((g) => g.correct)
    return shell(<>
      <section className="bk-panel bk-spotlight space-y-3 text-center">
        <h2 className="bk-title text-3xl">{anyRight ? (ar ? 'البِكس عرف الكلمة! 🤯' : 'The spy guessed it! 🤯') : (ar ? 'الكلمة كانت…' : 'The word was…')}</h2>
        <div className="mx-auto w-fit rounded-2xl bg-white px-6 py-2 font-display text-3xl text-bk-900">{deck.emoji} {ar ? deck.word_ar : deck.word_en || deck.word_ar}</div>
        <div className="flex justify-center gap-3">{spies.map((i) => <div key={i} className="space-y-1"><Avatar avatar={named[i].avatar} size={72} ring="#ff6fa8" badge="🕵️" /><div className="font-semibold">{named[i].name}</div>
          <div className="text-xs">{ar ? 'خمّن: ' : 'Guessed: '}<b>{guesses[i]?.word ?? '—'}</b> {guesses[i]?.correct ? '✅' : '❌'}</div></div>)}</div>
      </section>
      <section className="bk-panel space-y-2 text-sm">
        <h3 className="font-semibold">🗳️ {ar ? 'مين صوّت لمين' : 'Who voted for whom'}</h3>
        {Object.entries(votes).map(([v, s]) => <div key={v} className="flex items-center gap-2"><span className="w-24 truncate">{named[+v].name}</span><span>{ar ? '←' : '→'}</span><span className="flex-1 truncate">{named[s].name}</span><span>{spies.includes(s) ? '✅ +2' : '❌'}</span></div>)}
      </section>
      <section className="bk-panel space-y-2">
        <h3 className="font-semibold">📊 {ar ? 'الـ Score بعد الجولة' : 'Score after this round'}</h3>
        {named.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score).map(({ p, i }, r) => (
          <div key={i} className="flex items-center gap-3"><span>{['🥇', '🥈', '🥉'][r] ?? r + 1}</span><Avatar avatar={p.avatar} size={32} badge={spies.includes(i) ? '🕵️' : undefined} /><span className="flex-1">{p.name}</span>
            {(deltas[i] ?? 0) > 0 && <span className="bk-chip bg-bk-lime/20 text-bk-lime" dir="ltr">+{deltas[i]}</span>}<b className="text-bk-accent">{p.score}</b></div>))}
      </section>
      <button type="button" className="bk-btn w-full" onClick={() => void start()}>▶ {ar ? 'الجولة الجاية' : 'Next round'}</button>
      <button type="button" className="bk-btn-ghost w-full" onClick={() => setStage('setup')}>⚙️ {ar ? 'غيّر اللاعبين والإعدادات' : 'Change players & settings'}</button>
    </>)
  }
  return shell(<p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>)
}

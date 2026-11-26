import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { bakasaError, localDeck, type LocalDeck } from '../../bakasa/api'
import { useCategories } from '../../bakasa/SettingsForm'
import { Avatar, AVATAR_KEYS, BakasaLogo, playSound, SoundToggle, TimerRing } from '../../bakasa/ui'

type Stage = 'setup' | 'pass' | 'role' | 'discuss' | 'vote' | 'guess-pass' | 'guess' | 'result'
interface LocalPlayer { name: string; avatar: string; score: number }

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

export default function BakasaLocal() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const cats = useCategories()
  const [players, setPlayers] = useState<LocalPlayer[]>([{ name: '', avatar: 'fox', score: 0 }, { name: '', avatar: 'cat', score: 0 }, { name: '', avatar: 'owl', score: 0 }])
  const [spyCount, setSpyCount] = useState(1)
  const [category, setCategory] = useState<string | null>(null)
  const [minutes, setMinutes] = useState(5)
  const [stage, setStage] = useState<Stage>('setup')
  const [deck, setDeck] = useState<LocalDeck | null>(null)
  const [spies, setSpies] = useState<number[]>([])
  const [turn, setTurn] = useState(0)
  const [order, setOrder] = useState<number[]>([])
  const [accused, setAccused] = useState<number | null>(null)
  const [guessOk, setGuessOk] = useState<boolean | null>(null)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => { if (!endsAt) return; const id = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(id) }, [endsAt])
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null
  // Leaving the page mid-round should not reveal roles via back navigation: roles live only in memory.
  useEffect(() => {
    if (stage === 'setup' || stage === 'result') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [stage])

  const named = players.map((p, i) => ({ ...p, name: p.name.trim() || (ar ? `لاعب ${i + 1}` : `Player ${i + 1}`) }))
  const maxSpies = Math.max(1, Math.floor((players.length - 1) / 2))

  const start = async () => {
    setError(null)
    try {
      const d = await localDeck(category)
      setDeck(d)
      setSpies(shuffle(players.map((_, i) => i)).slice(0, Math.min(spyCount, maxSpies)))
      setOrder(shuffle(players.map((_, i) => i)))
      setTurn(0); setAccused(null); setGuessOk(null); setRound((r) => r + 1)
      setStage('pass')
    } catch (e) { setError(bakasaError(e, ar)) }
  }
  const nextReveal = () => {
    if (turn + 1 < players.length) { setTurn(turn + 1); setStage('pass') }
    else { setStage('discuss'); setEndsAt(Date.now() + minutes * 60_000) }
  }
  const finish = (caught: boolean, guessedRight: boolean | null) => {
    const spyWins = !caught || !!guessedRight
    setPlayers((ps) => ps.map((p, i) => ({ ...p, score: p.score + (spies.includes(i) ? (!caught ? 3 : guessedRight ? 2 : 0) : (spyWins ? 0 : 2)) })))
    setEndsAt(null); setStage('result'); playSound(spyWins ? 'lose' : 'win')
  }
  const firstAsker = useMemo(() => order[0] ?? 0, [order])

  const shell = (children: React.ReactNode) => (
    <main className="bakasa"><div className="bk-shell space-y-4">
      <div className="flex items-center justify-between">
        {stage === 'setup' ? <Link to="/bakasa" className="bk-btn-ghost">{ar ? 'رجوع' : 'Back'}</Link>
          : <button type="button" className="bk-btn-ghost" onClick={() => { if (window.confirm(ar ? 'تنهي الجولة وترجع للإعدادات؟' : 'End the round and return to setup?')) { setStage('setup'); setEndsAt(null) } }}>{ar ? 'إنهاء' : 'End'}</button>}
        <div className="flex items-center gap-2"><SoundToggle /><BakasaLogo small /></div>
      </div>{children}</div></main>
  )

  if (stage === 'setup') return shell(<>
    <h1 className="bk-title text-3xl">📱 {ar ? 'العب على موبايل واحد' : 'Pass-the-phone'}</h1>
    <section className="bk-panel space-y-3">
      <h2 className="font-semibold">{ar ? 'اللاعبين' : 'Players'} ({players.length})</h2>
      {players.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <button type="button" aria-label={ar ? 'غيّر الشخصية' : 'Change avatar'} onClick={() => setPlayers((ps) => ps.map((x, j) => j === i ? { ...x, avatar: AVATAR_KEYS[(AVATAR_KEYS.indexOf(x.avatar) + 1) % AVATAR_KEYS.length] } : x))}><Avatar avatar={p.avatar} size={44} /></button>
          <input className="bk-input py-2" maxLength={20} value={p.name} placeholder={ar ? `لاعب ${i + 1}` : `Player ${i + 1}`} aria-label={ar ? `اسم لاعب ${i + 1}` : `Player ${i + 1} name`}
            onChange={(e) => setPlayers((ps) => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
          {players.length > 3 && <button type="button" className="bk-icon-btn" aria-label={ar ? 'احذف' : 'Remove'} onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))}>✖</button>}
        </div>
      ))}
      {players.length < 12 && <button type="button" className="bk-btn-ghost w-full" onClick={() => setPlayers((ps) => [...ps, { name: '', avatar: AVATAR_KEYS[ps.length % AVATAR_KEYS.length], score: 0 }])}>➕ {ar ? 'زوّد لاعب' : 'Add player'}</button>}
    </section>
    <section className="bk-panel space-y-3">
      <div className="flex items-center justify-between"><span>{ar ? 'عدد البِكس' : 'Spies'}</span>
        <div className="flex items-center gap-2"><button type="button" className="bk-icon-btn" onClick={() => setSpyCount(Math.max(1, spyCount - 1))}>−</button><b className="w-6 text-center">{Math.min(spyCount, maxSpies)}</b><button type="button" className="bk-icon-btn" onClick={() => setSpyCount(Math.min(maxSpies, spyCount + 1))}>+</button></div></div>
      <div className="flex items-center justify-between"><span>{ar ? 'وقت النقاش (دقايق)' : 'Discussion (min)'}</span>
        <div className="flex items-center gap-2"><button type="button" className="bk-icon-btn" onClick={() => setMinutes(Math.max(1, minutes - 1))}>−</button><b className="w-6 text-center">{minutes}</b><button type="button" className="bk-icon-btn" onClick={() => setMinutes(Math.min(15, minutes + 1))}>+</button></div></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`bk-chip border-2 ${category === null ? 'border-bk-accent bg-bk-accent/20' : 'border-white/15'}`} onClick={() => setCategory(null)}>🎲 {ar ? 'عشوائي' : 'Random'}</button>
        {cats?.map((c) => <button key={c.id} type="button" className="bk-chip border-2" style={{ borderColor: category === c.id ? c.color : 'rgba(255,255,255,.15)', background: category === c.id ? `${c.color}33` : undefined }} onClick={() => setCategory(c.id)}>{c.emoji} {ar ? c.name_ar : c.name_en}</button>)}
      </div>
    </section>
    {round > 0 && <section className="bk-panel"><h2 className="mb-2 font-semibold">{ar ? 'النقاط' : 'Scores'}</h2>{[...named].sort((a, b) => b.score - a.score).map((p) => <div key={p.name} className="flex justify-between"><span>{p.name}</span><b className="text-bk-accent">{p.score}</b></div>)}</section>}
    {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
    <button type="button" className="bk-btn w-full" onClick={() => void start()}>{round > 0 ? (ar ? 'الجولة الجاية ▶' : 'Next round ▶') : (ar ? 'يلا نوزّع الأدوار ▶' : 'Deal roles ▶')}</button>
  </>)

  const current = named[turn]
  if (stage === 'pass') return shell(
    <section className="bk-panel bk-pop space-y-5 py-10 text-center">
      <div className="text-6xl">🤫</div>
      <p className="text-lg">{ar ? 'سلّم الموبايل لـ' : 'Pass the phone to'}</p>
      <div className="mx-auto w-fit"><Avatar avatar={current.avatar} size={96} /></div>
      <h2 className="bk-title text-4xl">{current.name}</h2>
      <p className="text-sm opacity-75">{ar ? 'محدش يبص غيره!' : 'No peeking, everyone else!'}</p>
      <button type="button" className="bk-btn w-full" onClick={() => setStage('role')}>{ar ? `أنا ${current.name} – جاهز` : `I'm ${current.name} – ready`}</button>
    </section>)

  if (stage === 'role' && deck) {
    const isSpy = spies.includes(turn)
    return shell(
      <section className="bk-panel bk-pop space-y-4 py-8 text-center" style={{ border: `3px solid ${isSpy ? '#ff6fa8' : deck.color}` }}>
        {isSpy ? <>
          <div className="text-6xl">🕵️</div><h2 className="bk-title text-3xl text-bk-pink">{ar ? 'أنت البِكس!' : 'You are the spy!'}</h2>
          <span className="bk-chip bg-white/10">{deck.emoji} {ar ? deck.category_ar : deck.category_en}</span>
          <p className="text-sm">{ar ? 'حاول تفهم الكلمة من كلام الباقيين من غير ما حد يكشفك!' : 'Work out the word without getting caught!'}</p>
        </> : <>
          <p>{ar ? 'أنت لاعب عادي' : 'You are a regular player'}</p>
          <span className="bk-chip" style={{ background: `${deck.color}33`, color: deck.color }}>{deck.emoji} {ar ? deck.category_ar : deck.category_en}</span>
          <div className="mx-auto w-fit rounded-2xl bg-white px-6 py-3 font-display text-4xl text-bk-900">{ar ? deck.word_ar : deck.word_en || deck.word_ar}</div>
          <p className="text-sm">{ar ? 'خلي إجاباتك ذكية من غير ما تكشف الكلمة!' : 'Answer cleverly without giving it away!'}</p>
        </>}
        <button type="button" className="bk-btn w-full" onClick={nextReveal}>🙈 {ar ? 'خبّيت الدور – اللي بعده' : 'Hidden – next player'}</button>
      </section>)
  }

  if (stage === 'discuss') return shell(<>
    <section className="bk-panel space-y-4 text-center">
      <div className="flex items-center justify-between"><h2 className="font-display text-2xl text-bk-accent">{ar ? 'وقت الأسئلة!' : 'Question time!'}</h2><TimerRing seconds={left} total={minutes * 60} label={ar ? 'الوقت' : 'Time'} /></div>
      <p>{ar ? 'يبدأ بالسؤال:' : 'First to ask:'} <b className="text-bk-accent">{named[firstAsker].name}</b></p>
      <p className="text-sm opacity-80">{ar ? 'كل واحد يسأل اللي بعده سؤال عن الكلمة. البِكس لازم يجاوب من غير ما يتكشف.' : 'Each player asks the next one a question about the word.'}</p>
      <ol className="flex flex-wrap justify-center gap-3">{order.map((i) => <li key={i} className="flex flex-col items-center gap-1"><Avatar avatar={named[i].avatar} size={44} /><span className="text-xs">{named[i].name}</span></li>)}</ol>
    </section>
    <button type="button" className="bk-btn w-full" onClick={() => { setEndsAt(null); setStage('vote') }}>🗳️ {left === 0 ? (ar ? 'الوقت خلص – صوّتوا!' : "Time's up – vote!") : (ar ? 'جاهزين نصوّت' : 'Ready to vote')}</button>
  </>)

  if (stage === 'vote') return shell(<>
    <h2 className="bk-title text-center text-3xl">{ar ? 'مين شاكين إنه البِكس؟' : 'Who is the spy?'}</h2>
    <p className="text-center text-sm opacity-80">{ar ? 'اتفقوا مع بعض واختاروا شخص واحد.' : 'Agree together and pick one person.'}</p>
    <ul className="grid grid-cols-2 gap-3">{named.map((p, i) => (
      <li key={i}><button type="button" onClick={() => setAccused(i)} aria-pressed={accused === i}
        className={`flex w-full flex-col items-center gap-2 rounded-3xl p-3 ${accused === i ? 'bg-[#ff5d5d]/25 ring-4 ring-[#ff5d5d]' : 'bg-white/5'}`}><Avatar avatar={p.avatar} size={60} /><span className="font-semibold">{p.name}</span></button></li>))}</ul>
    <button type="button" className="bk-btn w-full" disabled={accused === null} onClick={() => {
      if (accused === null) return
      if (spies.includes(accused)) { playSound('reveal'); setStage('guess-pass') } else finish(false, null)
    }}>{ar ? 'اكشف!' : 'Reveal!'}</button>
  </>)

  if (stage === 'guess-pass' && accused !== null) return shell(
    <section className="bk-panel bk-pop space-y-4 py-8 text-center">
      <h2 className="bk-title text-3xl">{ar ? 'تم كشف البِكس! 🎯' : 'Spy caught! 🎯'}</h2>
      <div className="mx-auto w-fit"><Avatar avatar={named[accused].avatar} size={96} ring="#ff6fa8" badge="🕵️" /></div>
      <p>{ar ? `${named[accused].name}، لسه عندك فرصة أخيرة… تقدر تعرف الكلمة؟` : `${named[accused].name}, one last chance… can you guess the word?`}</p>
      <button type="button" className="bk-btn w-full" onClick={() => setStage('guess')}>{ar ? 'خمّن' : 'Guess'}</button>
    </section>)

  if (stage === 'guess' && deck) return shell(
    <section className="bk-panel space-y-3 text-center">
      <h2 className="font-display text-2xl">{ar ? 'الكلمة كانت إيه؟' : 'What was the word?'}</h2>
      <div className="grid grid-cols-2 gap-2">{deck.options.map((o) => (
        <button key={o.id} type="button" className="bk-btn-ghost text-lg" onClick={() => { const ok = o.id === deck.word_id; setGuessOk(ok); finish(true, ok) }}>{ar ? o.word_ar : o.word_en || o.word_ar}</button>))}</div>
    </section>)

  if (stage === 'result' && deck) {
    const caught = accused !== null && spies.includes(accused)
    const spyWins = !caught || !!guessOk
    return shell(<>
      <section className="bk-panel bk-spotlight space-y-3 text-center">
        <h2 className="bk-title text-3xl">{!caught ? (ar ? 'البِكس قدر يخدعكم! 😈' : 'The spy fooled you! 😈') : guessOk ? (ar ? 'اتكشف… بس عرف الكلمة! 🤯' : 'Caught… but guessed it! 🤯') : (ar ? 'تم كشف البِكس! 🎉' : 'Spy unmasked! 🎉')}</h2>
        <div className="flex justify-center gap-3">{spies.map((i) => <div key={i} className="space-y-1"><Avatar avatar={named[i].avatar} size={72} ring="#ff6fa8" badge="🕵️" /><div className="font-semibold">{named[i].name}</div></div>)}</div>
        <div className="mx-auto w-fit rounded-2xl bg-white px-6 py-2 font-display text-3xl text-bk-900">{deck.emoji} {ar ? deck.word_ar : deck.word_en || deck.word_ar}</div>
        <p className="font-bold text-bk-accent">{spyWins ? (ar ? 'البِكس كسب الجولة' : 'The spy wins the round') : (ar ? 'اللاعبين كسبوا الجولة' : 'The players win the round')}</p>
      </section>
      <section className="bk-panel space-y-2">{[...named].sort((a, b) => b.score - a.score).map((p, i) => (
        <div key={p.name + i} className="flex items-center gap-3"><span>{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><Avatar avatar={p.avatar} size={32} /><span className="flex-1">{p.name}</span><b className="text-bk-accent">{p.score}</b></div>))}</section>
      <button type="button" className="bk-btn w-full" onClick={() => void start()}>▶ {ar ? 'الجولة الجاية' : 'Next round'}</button>
      <button type="button" className="bk-btn-ghost w-full" onClick={() => setStage('setup')}>⚙️ {ar ? 'غيّر الإعدادات' : 'Change settings'}</button>
    </>)
  }
  return shell(<p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>)
}

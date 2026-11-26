import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { LangToggle } from '../../components/LangToggle'
import { Avatar, BakasaLogo, SoundToggle } from '../../bakasa/ui'
import { useCategories } from '../../bakasa/SettingsForm'

const DEMO = [
  { ar: 'كل واحد يخربش كارته ويعرف: بِكس ولا الكلمة؟', en: 'Everyone scratches a card: spy or the word?', icon: '🃏' },
  { ar: 'فترة الأسئلة: "محمود اسأل فتحي"… لحد ما الكل يسأل', en: 'Questions: "Mahmoud, ask Fathi"… until everyone asks', icon: '💬' },
  { ar: 'كل واحد يصوّت لوحده: مين البِكس؟ الصح ياخد +2', en: 'Everyone votes alone: who is the spy? Right = +2', icon: '🗳️' },
  { ar: 'البِكس يخمّن الكلمة من 12 اقتراح… والسكور يظهر', en: 'The spy guesses the word from 12 options… then scores', icon: '🎉' }
]

export default function BakasaIntro() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const cats = useCategories()
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setStep((s) => (s + 1) % DEMO.length), 2200)
    return () => window.clearInterval(id)
  }, [])
  return (
    <main className="bakasa">
      <div className="bk-shell space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/" className="bk-btn-ghost">{ar ? 'الرئيسية' : 'Home'}</Link>
          <div className="flex gap-2"><SoundToggle /><LangToggle /></div>
        </div>
        <header className="space-y-2 text-center">
          <div className="bk-float mx-auto w-fit"><BakasaLogo /></div>
          <h1 className="bk-title">بكاسة – مين البِكس؟</h1>
          <p className="text-sm uppercase tracking-[.3em] text-bk-cyan">The Hidden Spy Game</p>
        </header>

        <section className="bk-panel space-y-2 text-center">
          <p className="text-xl font-semibold">فيه كلمة سرية كل اللاعبين عارفينها… ما عدا شخص واحد!</p>
          <p className="opacity-80">هل هتعرفوا تكشفوا البِكس قبل ما يعرف الكلمة؟</p>
        </section>

        <section className="bk-panel space-y-4" aria-label={ar ? 'طريقة اللعب' : 'How to play'}>
          <div className="flex items-center justify-center gap-2" aria-hidden="true">
            {['fox', 'cat', 'owl', 'panda'].map((a, i) => <span key={a} className={`transition duration-500 ${step === 3 && i === 2 ? 'scale-125' : ''}`}>
              <Avatar avatar={a} size={52} ring={step === 3 && i === 2 ? '#ff5d5d' : step === 2 ? '#ffb938' : undefined} badge={step === 3 && i === 2 ? '🕵️' : step === 0 ? '🃏' : undefined} /></span>)}
          </div>
          <ol className="space-y-2">
            {DEMO.map((d, i) => (
              <li key={i} className={`flex items-center gap-3 rounded-2xl p-3 transition ${i === step ? 'bg-bk-accent/20 ring-2 ring-bk-accent' : 'bg-white/5'}`}>
                <span className="text-2xl" aria-hidden="true">{d.icon}</span><span className="font-semibold">{ar ? d.ar : d.en}</span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-2xl bg-white/5 p-2"><div className="font-display text-xl text-bk-accent">3–20</div>{ar ? 'لاعب' : 'players'}</div>
            <div className="rounded-2xl bg-white/5 p-2"><div className="font-display text-xl text-bk-accent">1–3</div>{ar ? 'بِكس' : 'spies'}</div>
            <div className="rounded-2xl bg-white/5 p-2"><div className="font-display text-xl text-bk-accent">~10</div>{ar ? 'دقايق' : 'minutes'}</div>
          </div>
          {cats && cats.length > 0 && <div className="flex flex-wrap justify-center gap-2">{cats.map((c) => <span key={c.id} className="bk-chip" style={{ background: `${c.color}33`, color: c.color }}>{c.emoji} {ar ? c.name_ar : c.name_en}</span>)}</div>}
        </section>

        <nav className="grid gap-3">
          <Link to="/bakasa/create" className="bk-btn">🌐 {ar ? 'العب أونلاين – اعمل غرفة' : 'Play online – create room'}</Link>
          <Link to="/bakasa/join" className="bk-btn-ghost">🔑 {ar ? 'ادخل غرفة بالكود' : 'Join with a code'}</Link>
          <Link to="/bakasa/local" className="bk-btn-ghost">📱 {ar ? 'العب على موبايل واحد' : 'Play on one device'}</Link>
          <Link to="/bakasa/history" className="text-center text-sm underline opacity-75">{ar ? 'سجل مبارياتي' : 'My match history'}</Link>
        </nav>
      </div>
    </main>
  )
}

import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { gameById } from '../lib/games'
import { Sparkles } from '../components/GameArt'
import { FramedAvatar, TabBar, usePlayerIdentity } from '../components/ArcadeChrome'

export default function GameDetail() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const { avatar } = usePlayerIdentity()
  const [shared, setShared] = useState(false)
  const g = gameById(id)
  if (!g) return <Navigate to="/" replace />
  const share = () => {
    const url = `${window.location.origin}/game/${g.id}`
    const n = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> }
    if (n.share) { void n.share({ title: g.title[0], text: g.description[ar ? 0 : 1], url }).catch(() => undefined); return }
    void navigator.clipboard?.writeText(url).then(() => { setShared(true); window.setTimeout(() => setShared(false), 1600) }).catch(() => undefined)
  }
  return (
    <main className="arcade">
      <div className="ar-shell space-y-5">
        <header className="flex items-center justify-between">
          <button type="button" className="ar-icon" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label={ar ? 'رجوع' : 'Back'}>{ar ? '→' : '←'}</button>
          <Link to="/me" aria-label={ar ? 'ملفي' : 'My profile'}><FramedAvatar avatar={avatar} size={40} /></Link>
        </header>

        <section className="relative grid place-items-center pt-2">
          <span className="absolute top-6 h-48 w-48 rounded-full blur-3xl" style={{ background: g.glow, opacity: 0.45 }} aria-hidden="true" />
          <Sparkles />
          {g.art('ar-float relative h-60 w-60 drop-shadow-[0_20px_30px_rgba(0,0,0,.5)]')}
          <span className="h-3 w-32 rounded-[50%] bg-black/50 blur-sm" aria-hidden="true" />
        </section>

        <section className="space-y-2 text-center">
          <h1 className="text-3xl font-extrabold">{ar ? g.title[0] : g.title[1]}</h1>
          <p className="text-sm text-white/60">{ar ? g.description[0] : g.description[1]}</p>
          <div className="flex justify-center gap-2 pt-1 text-xs">
            <span className="ar-chip !py-1">👥 {g.players}</span><span className="ar-chip !py-1">⏱ {g.minutes} {ar ? 'دقيقة' : 'min'}</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="ar-btn-dark" onClick={share}>{shared ? '✓ ' : '📤 '}{ar ? 'شارك' : 'Share'}</button>
          <Link to={g.play.to} className="ar-btn">▶ {ar ? g.play.label[0] : g.play.label[1]}</Link>
        </div>

        <section className="ar-card space-y-3 p-4">
          <h2 className="font-bold">{ar ? 'طريقة اللعب' : 'How to play'}</h2>
          <ol className="space-y-2">
            {g.how.map(([a, e], i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-white/80">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: g.glow }}>{i + 1}</span>{ar ? a : e}
              </li>
            ))}
          </ol>
        </section>

        {g.more.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">{ar ? 'طرق تانية للعب' : 'More ways to play'}</h2>
            {g.more.map((m) => (
              <Link key={m.to} to={m.to} className="ar-card flex items-center gap-3 p-3 hover:bg-[#1c1c27]">
                <span className="grid h-11 w-11 place-items-center rounded-2xl text-xl" style={{ background: g.gradient }} aria-hidden="true">{m.icon}</span>
                <span className="flex-1 font-semibold">{ar ? m.label[0] : m.label[1]}</span><span className="ar-play" aria-hidden="true">▶</span>
              </Link>
            ))}
          </section>
        )}
      </div>
      <TabBar />
    </main>
  )
}

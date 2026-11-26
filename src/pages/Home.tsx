import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { GAMES, TAGS, type GameTag } from '../lib/games'
import { SpyArt, Sparkles } from '../components/GameArt'
import { FramedAvatar, TabBar, usePlayerIdentity } from '../components/ArcadeChrome'

/** Player hub, styled as a game launcher. */
export default function Home() {
  const { lang, toggle } = useI18n()
  const ar = lang === 'ar'
  const { name, avatar } = usePlayerIdentity()
  const [tag, setTag] = useState<GameTag | 'all'>('all')
  const games = GAMES.filter((g) => tag === 'all' || g.tags.includes(tag))
  const hour = new Date().getHours()
  const greet = ar ? (hour < 12 ? 'صباح الخير' : 'مساء الخير') : (hour < 12 ? 'Good morning' : 'Good evening')
  const quick = [
    { to: '/bakasa/create', icon: '🕵️', title: ar ? 'اعمل غرفة بكاسة' : 'Create a Bakasa room', sub: ar ? 'ادعي صحابك بالكود أو QR' : 'Invite friends by code or QR', color: '#ff6a3d' },
    { to: '/bakasa/local', icon: '📱', title: ar ? 'بكاسة على موبايل واحد' : 'Bakasa on one phone', sub: ar ? 'لفّوا الموبايل على بعض' : 'Pass the phone around', color: '#ff5f6d' },
    { to: '/join', icon: '🧩', title: ar ? 'ادخل غرفة أحجية' : 'Join a puzzle room', sub: ar ? 'بكود من المضيف' : 'With the host’s code', color: '#3b82f6' },
    { to: '/detective', icon: '🔍', title: ar ? 'قضية تحقيق جديدة' : 'Open a detective case', sub: ar ? 'العب لوحدك' : 'Solo investigation', color: '#14b8a6' }
  ]
  return (
    <main className="arcade">
      <div className="ar-shell space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{name ? (ar ? `${greet} يا ${name} 👋` : `${greet}, ${name} 👋`) : (ar ? 'أهلاً بيك يا بطل 👋' : 'Welcome back, player 👋')}</h1>
            <p className="text-sm text-white/55">{ar ? 'تحب تلعب إيه النهارده؟' : "What's your favourite game to play?"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="ar-icon text-sm font-bold" onClick={toggle} aria-label={ar ? 'English' : 'العربية'}>{ar ? 'EN' : 'ع'}</button>
            <Link to="/me" aria-label={ar ? 'ملفي' : 'My profile'}><FramedAvatar avatar={avatar} size={44} /></Link>
          </div>
        </header>

        <Link to="/game/bakasa" className="ar-hero block">
          <Sparkles />
          <div className="relative max-w-[60%] space-y-2">
            <span className="inline-block rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-bold">{ar ? '🔥 جديد' : '🔥 New'}</span>
            <h2 className="text-2xl font-extrabold leading-tight drop-shadow">{ar ? 'العب مع صحابك واكشف البِكس!' : 'Play with friends and catch the spy!'}</h2>
            <p className="text-xs text-white/85">{ar ? 'بكاسة – لعبة الحفلات الجديدة' : 'Bakasa – the new party game'}</p>
            <span className="mt-1 inline-flex rounded-xl bg-[#111] px-4 py-2 text-sm font-bold">{ar ? 'العب دلوقتي' : 'Play now'}</span>
          </div>
          <SpyArt className="ar-float absolute -bottom-3 h-44 w-44 ltr:-right-4 rtl:-left-4" />
        </Link>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={ar ? 'الفئات' : 'Categories'}>
          {TAGS.map((t) => <button key={t.id} type="button" className="ar-chip" aria-pressed={tag === t.id} onClick={() => setTag(t.id)}>{t.icon} {ar ? t.label[0] : t.label[1]}</button>)}
        </div>

        <section className="space-y-3">
          <div><h2 className="text-lg font-bold">{ar ? 'ألعابنا' : 'Original play'} <span aria-hidden="true">›</span></h2>
            <p className="text-xs text-white/45">{ar ? 'اختار لعبتك واضغط عشان تبدأ' : 'Pick a game to start'}</p></div>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {games.map((g) => (
              <li key={g.id}>
                <Link to={`/game/${g.id}`} className="ar-game" style={{ background: g.gradient }}>
                  {g.art('ar-art ar-float')}
                  <span className="relative text-lg font-extrabold leading-tight drop-shadow">{ar ? g.title[0] : g.title[1]}</span>
                  <span className="relative text-[11px] text-white/80">{ar ? 'اضغط عشان تلعب' : 'Tap to play'}</span>
                </Link>
              </li>
            ))}
            {games.length === 0 && <li className="text-sm text-white/50">{ar ? 'مفيش ألعاب في الفئة دي لسه.' : 'No games in this category yet.'}</li>}
          </ul>
        </section>

        <section className="space-y-3">
          <div><h2 className="text-lg font-bold">{ar ? 'ابدأ بسرعة' : 'Quick play'} <span aria-hidden="true">›</span></h2>
            <p className="text-xs text-white/45">{ar ? 'اختصارات لأشهر طرق اللعب' : 'Shortcuts to jump straight in'}</p></div>
          <ul className="space-y-2.5">
            {quick.map((q) => (
              <li key={q.to}>
                <Link to={q.to} className="ar-card flex items-center gap-3 p-3 transition hover:bg-[#1c1c27]">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `linear-gradient(140deg, ${q.color}, ${q.color}99)` }} aria-hidden="true">{q.icon}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{q.title}</span><span className="block truncate text-xs text-white/50">{q.sub}</span></span>
                  <span className="ar-play" aria-hidden="true">▶</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <TabBar />
    </main>
  )
}

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { BRAND } from '../brand/Logo'
import { IconBakasa, IconDetective, IconJoin, IconMultiplayer, IconPlus, IconStory } from '../brand/icons'
import { DetectiveArt, PuzzleBookArt, SpyArt } from '../components/GameArt'
import { usePlayerIdentity } from '../components/ArcadeChrome'
import { BrandHeader } from '../components/fz/BrandHeader'
import { BottomNav } from '../components/fz/MainNavigation'
import { GameModeCard } from '../components/fz/GameModeCard'
import { PrimaryActionButton } from '../components/fz/PrimaryActionButton'
import { RecentGamesSection } from '../components/fz/RecentGamesSection'
import { GameStatistics } from '../components/fz/GameStatistics'
import { PlayerProfileSummary } from '../components/fz/PlayerProfileSummary'
import { useRecentGames } from '../lib/useRecentGames'
import { routeForCode } from '../lib/recentGames'

/** Friends Zone home: welcome, the three real game modes, multiplayer (create / join), real recent games and stats. */
export default function Home() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const { name, avatar } = usePlayerIdentity()
  const recent = useRecentGames()
  const [code, setCode] = useState('')
  const join = (e: FormEvent) => { e.preventDefault(); const to = routeForCode(code); if (to) nav(to) }

  const modes = [
    { to: '/game/story', accent: 'var(--fz-mode-story)', Icon: IconStory, art: <PuzzleBookArt className="h-full w-full" />,
      title: ar ? 'أحجية الحكاية' : 'Story Puzzle', meta: ar ? 'قصص · فرق' : 'Stories · Teams',
      description: ar ? 'جاوبوا على كروت الأسئلة وركّبوا صورة الحكاية قبل الفرق التانية.' : 'Answer clue cards and rebuild the story picture before the other teams.' },
    { to: '/detective', accent: 'var(--fz-mode-detective)', Icon: IconDetective, art: <DetectiveArt className="h-full w-full" />,
      title: ar ? 'المحقق' : 'Detective', meta: ar ? 'تحقيق · أدلة' : 'Cases · Evidence',
      description: ar ? 'افحص مسرح الجريمة بنفسك، اكتشف الأدلة، واكشف الحقيقة.' : 'Search the crime scene yourself, uncover the evidence and reveal the truth.' },
    { to: '/bakasa', accent: 'var(--fz-mode-bakasa)', Icon: IconBakasa, art: <SpyArt className="h-full w-full" />,
      title: ar ? 'بكاسة' : 'Bakasa', meta: ar ? 'حفلة · خداع' : 'Party · Bluffing',
      description: ar ? 'مين البِكس اللي مايعرفش الكلمة؟ اسألوا، صوّتوا، واكشفوه.' : 'Who is the spy without the word? Ask, vote and catch them.' }
  ]

  return (
    <main className="fz-page">
      <BrandHeader />
      <div className="fz-shell space-y-8 pt-6 md:space-y-10 md:pt-10">
        {/* welcome */}
        <section className="relative overflow-hidden rounded-[var(--fz-radius-xl)] border border-white/10 p-6 md:p-10"
          style={{ background: 'radial-gradient(40rem 20rem at 0% 0%, rgba(109,74,255,.42), transparent 70%), radial-gradient(30rem 18rem at 100% 100%, rgba(32,213,210,.18), transparent 70%), var(--fz-surface-1)' }}>
          <svg className="fz-hero-orbit" viewBox="40 40 432 432" aria-hidden="true">
            <path d="M136 136 A170 170 0 0 1 415.7 197.9" fill="none" stroke="#F5F5FA" strokeOpacity=".25" strokeWidth="14" strokeLinecap="round" />
            <path d="M376 376 A170 170 0 0 1 96.3 314.1" fill="none" stroke="#20D5D2" strokeOpacity=".35" strokeWidth="14" strokeLinecap="round" />
            <circle cx="136" cy="136" r="26" fill="#E5B85C" fillOpacity=".8" /><circle cx="376" cy="376" r="26" fill="#20D5D2" fillOpacity=".8" />
          </svg>
          <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <PlayerProfileSummary name={name} avatar={avatar} ar={ar} />
              <h1 className="fz-display text-[2rem] leading-[1.15] md:text-5xl">
                {ar ? <>أهلاً بيك في <span className="whitespace-nowrap" style={{ backgroundImage: 'var(--fz-grad-zone)', WebkitBackgroundClip: 'text', color: 'transparent' }}>فريندز زون</span>!</>
                  : <>Welcome to <span className="whitespace-nowrap" style={{ backgroundImage: 'var(--fz-grad-zone)', WebkitBackgroundClip: 'text', color: 'transparent' }}>Friends Zone</span>!</>}
              </h1>
              <p className="fz-muted max-w-xl text-base md:text-lg">{ar ? 'تحدّى صحابك، حلّوا القضايا، واكتشفوا مغامرات جديدة مع بعض.' : 'Challenge your friends, crack cases and discover new adventures together.'}</p>
              <p className="text-sm font-bold" style={{ color: 'var(--fz-gold)' }}>{BRAND.tagline[lang]}</p>
            </div>
            <div className="flex flex-wrap gap-3 md:flex-col">
              <PrimaryActionButton to="/play/new" Icon={IconPlus}>{ar ? 'اعمل غرفة' : 'Create room'}</PrimaryActionButton>
              <PrimaryActionButton to="#join" variant="secondary" Icon={IconJoin} className="md:!justify-start">{ar ? 'ادخل بكود' : 'Join with code'}</PrimaryActionButton>
            </div>
          </div>
        </section>

        {/* game modes */}
        <section aria-labelledby="fz-modes-h" className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div><h2 id="fz-modes-h" className="fz-display text-2xl md:text-3xl">{ar ? 'اختار لعبتك' : 'Pick your game'}</h2>
              <p className="fz-muted text-sm">{ar ? 'تلات طرق تلعبوا بيها مع بعض' : 'Three ways to play together'}</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modes.map((m) => <GameModeCard key={m.to} {...m} playLabel={ar ? 'العب' : 'Play'} />)}
          </div>
        </section>

        {/* multiplayer */}
        <section id="join" aria-labelledby="fz-multi-h" className="fz-card scroll-mt-24 overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--fz-mode-multiplayer) 45%, transparent)' }}>
          <div className="grid gap-6 p-5 md:grid-cols-2 md:p-7">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fz-purple text-white" aria-hidden="true"><IconMultiplayer size={26} /></span>
                <div><h2 id="fz-multi-h" className="fz-display text-2xl">{ar ? 'العب مع صحابك' : 'Play with friends'}</h2>
                  <p className="fz-muted text-sm">{ar ? 'اعمل غرفة وابعت الكود، أو ادخل غرفة صاحبك.' : 'Create a room and share the code, or join a friend’s room.'}</p></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <PrimaryActionButton to="/play/new" Icon={IconStory} className="w-full">{ar ? 'غرفة قصص' : 'Story room'}</PrimaryActionButton>
                <PrimaryActionButton to="/bakasa/create" variant="secondary" Icon={IconBakasa} className="w-full">{ar ? 'غرفة بكاسة' : 'Bakasa room'}</PrimaryActionButton>
              </div>
              <p className="fz-muted text-xs">{ar ? 'في غرفة القصص، صاحب الغرفة بيختار القصة من العنوان والغلاف بس، من غير ما يشوف محتواها.' : 'In a story room the host picks a story by its title and cover only, without seeing its content.'}</p>
            </div>
            <form onSubmit={join} className="space-y-3 rounded-[var(--fz-radius-lg)] bg-fz-s2/60 p-4">
              <label htmlFor="fz-code" className="fz-display block text-lg">{ar ? 'معاك كود غرفة؟' : 'Got a room code?'}</label>
              <p className="fz-muted text-xs">{ar ? 'أي كود: قصص، بكاسة (BK-) أو تحقيق جماعي (DT-).' : 'Any code: Story, Bakasa (BK-) or a Detective team (DT-).'}</p>
              <div className="flex gap-2">
                <input id="fz-code" className="fz-input text-center font-mono text-lg tracking-[.2em]" dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  placeholder="AB-123456" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} />
                <PrimaryActionButton type="submit" variant="outline" Icon={IconJoin} disabled={!code.trim()}>{ar ? 'ادخل' : 'Join'}</PrimaryActionButton>
              </div>
            </form>
          </div>
        </section>

        {/* recent + stats */}
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <RecentGamesSection state={recent} />
          <GameStatistics stats={recent.stats} />
        </div>
      </div>
      <BottomNav />
    </main>
  )
}

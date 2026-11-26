import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { LangToggle } from '../components/LangToggle'
import { MagnifierArt, PuzzleArt, StoryLogo } from '../components/StoryArt'

/** Player hub: pick a game mode. */
export default function Home() {
  const { t } = useI18n()
  return (
    <main className="min-h-screen">
      <div className="game-shell space-y-6">
        <div className="flex justify-end"><LangToggle /></div>
        <header className="space-y-3 text-center">
          <StoryLogo className="float mx-auto h-32 w-32" />
          <h1 className="hero-title">{t('appName')}</h1>
          <p className="mx-auto max-w-sm text-parchment-100/80">{t('homeTagline')}</p>
        </header>

        <nav className="grid gap-4" aria-label={t('chooseMode')}>
          <Link to="/join" className="mode-card pop-in">
            <PuzzleArt />
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-sea-500">{t('modeTeams')}</p>
            <h2 className="mt-1 font-display text-2xl text-parchment-50">{t('modePuzzleTitle')}</h2>
            <p className="mt-2 max-w-[70%] text-sm text-parchment-100/75">{t('modePuzzleDesc')}</p>
            <span className="btn-primary mt-4">{t('joinRoomCta')}</span>
          </Link>
          <Link to="/detective" className="mode-card pop-in" style={{ animationDelay: '.08s' }}>
            <MagnifierArt />
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-gold-400">{t('modeSolo')}</p>
            <h2 className="mt-1 font-display text-2xl text-parchment-50">{t('modeDetectiveTitle')}</h2>
            <p className="mt-2 max-w-[70%] text-sm text-parchment-100/75">{t('modeDetectiveDesc')}</p>
            <span className="btn-ghost mt-4">{t('openCases')}</span>
          </Link>
        </nav>

        <ol className="story-panel grid grid-cols-3 gap-2 text-center text-xs text-parchment-100/80" aria-label={t('howToPlay')}>
          <li><div className="font-display text-2xl text-gold-400">1</div>{t('stepJoin')}</li>
          <li><div className="font-display text-2xl text-gold-400">2</div>{t('stepAnswer')}</li>
          <li><div className="font-display text-2xl text-gold-400">3</div>{t('stepReveal')}</li>
        </ol>
      </div>
    </main>
  )
}

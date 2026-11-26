import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { playerCreateRoom, hostError, type StoryCard } from '../rooms/api'
import { StoryPicker } from '../rooms/StoryPicker'

const savedName = () => { try { return localStorage.getItem('playerName') ?? '' } catch { return '' } }

/** Any player can open a Story Puzzle room and pick a story by its title card. The host never sees story content. */
export default function CreateRoom() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const [story, setStory] = useState<StoryCard | null>(null)
  const [name, setName] = useState(savedName)
  const [teams, setTeams] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = async () => {
    if (!story || !name.trim()) return
    setBusy(true); setError(null)
    try {
      const r = await playerCreateRoom(story.id, name.trim(), teams)
      try { localStorage.setItem('playerName', name.trim()) } catch { /* ignore */ }
      nav(`/play/${r.id}`, { replace: true })
    } catch (e) { setError(hostError(e, ar)); setBusy(false) }
  }
  return (
    <main className="min-h-screen"><div className="game-shell space-y-4 pb-28">
      <header className="flex items-center justify-between">
        <Link to="/game/story" className="btn-ghost">{ar ? 'رجوع' : 'Back'}</Link>
        <Link to="/join" className="text-sm underline opacity-80">{ar ? 'عندك كود؟ ادخل غرفة' : 'Have a code? Join'}</Link>
      </header>
      <section className="story-panel space-y-1">
        <h1 className="hero-title text-3xl">{ar ? 'اعمل غرفتك' : 'Create your room'}</h1>
        <p className="text-sm opacity-80">{ar ? 'اختار قصة من الكروت. هتشوف عنوانها بس، والأسئلة والصور هتتكشف وانتم بتلعبوا مع بعض.' : 'Pick a story card. You only see its title; questions and pictures are revealed while you all play.'}</p>
      </section>
      <StoryPicker ar={ar} value={story?.id ?? null} onChange={setStory} />
      <section className="card grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1"><span className="text-sm">{ar ? 'اسمك' : 'Your name'}</span>
          <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" /></label>
        <div className="space-y-1"><span className="text-sm">{ar ? 'عدد الفرق' : 'Teams'}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost px-4" onClick={() => setTeams((n) => Math.max(2, n - 1))} aria-label={ar ? 'أقل' : 'Fewer'}>−</button>
            <b className="w-8 text-center text-xl">{teams}</b>
            <button type="button" className="btn-ghost px-4" onClick={() => setTeams((n) => Math.min(4, n + 1))} aria-label={ar ? 'أكتر' : 'More'}>+</button>
          </div></div>
      </section>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink-900/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm">{story ? <>{ar ? 'القصة: ' : 'Story: '}<b>{story.title}</b></> : (ar ? 'اختار قصة الأول' : 'Choose a story first')}</span>
          <button type="button" className="btn-primary" disabled={!story || !name.trim() || busy} onClick={() => void create()}>{busy ? '…' : (ar ? 'اعمل الغرفة ▶' : 'Create room ▶')}</button>
        </div>
      </div>
    </div></main>
  )
}

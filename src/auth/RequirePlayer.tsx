import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useI18n } from '../lib/i18n'
import { StoryLogo } from '../components/StoryArt'

/** Player routes need a session but not an account: offer a name-only guest sign-in. */
export function RequirePlayer({ children }: { children: ReactNode }) {
  const { session, loading, signInAnonymously } = useAuth()
  const { t } = useI18n()
  const [name, setName] = useState(() => { try { return localStorage.getItem('playerName') ?? '' } catch { return '' } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (loading) return <p className="p-6" role="status">{t('loading')}</p>
  if (session) return <>{children}</>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError(null)
    const err = await signInAnonymously(name.trim())
    if (err) { setError(t('errGeneric')); setBusy(false); return }
    try { localStorage.setItem('playerName', name.trim()) } catch { /* storage unavailable */ }
  }
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="story-panel w-full max-w-sm space-y-4 text-center">
        <StoryLogo className="mx-auto h-20 w-20" />
        <h1 className="font-display text-2xl text-gold-400">{t('whatsYourName')}</h1>
        <input className="input text-center" aria-label={t('yourName')} placeholder={t('yourName')} maxLength={40} required
          value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        {error && <p role="alert" className="text-danger">{error}</p>}
        <button className="btn-primary w-full" type="submit" disabled={busy || !name.trim()}>{t('letsPlay')}</button>
        <Link to="/" className="block text-sm opacity-70 underline">{t('backHome')}</Link>
      </form>
    </main>
  )
}

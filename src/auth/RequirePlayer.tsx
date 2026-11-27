import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useI18n } from '../lib/i18n'
import { FzLoader, FzMark, FzWordmark } from '../brand/Logo'

/** Player routes need a session but not an account: offer a name-only guest sign-in. */
export function RequirePlayer({ children }: { children: ReactNode }) {
  const { session, loading, signInAnonymously } = useAuth()
  const { t, lang } = useI18n()
  const [name, setName] = useState(() => { try { return localStorage.getItem('playerName') ?? '' } catch { return '' } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (loading) return <main className="fz-page grid place-items-center"><FzLoader size={84} label={t('loading')} /></main>
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
    <main className="fz-page grid place-items-center p-4">
      <form onSubmit={submit} className="fz-card w-full max-w-sm space-y-5 p-6 text-center">
        <div className="flex flex-col items-center gap-3"><FzMark size={76} title="Friends Zone" /><FzWordmark lang={lang} size={26} /></div>
        <p className="fz-muted text-sm">{lang === 'ar' ? 'عالم أصحابك.. واللعب مالوش حدود.' : 'Your Friends. Your Games. Your Zone.'}</p>
        <h1 className="fz-display text-2xl">{t('whatsYourName')}</h1>
        <input className="fz-input text-center" aria-label={t('yourName')} placeholder={t('yourName')} maxLength={40} required
          value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        {error && <p role="alert" className="text-fz-danger">{error}</p>}
        <button className="fz-btn fz-btn-primary w-full" type="submit" disabled={busy || !name.trim()}>{t('letsPlay')}</button>
        <Link to="/" className="fz-focus fz-muted block rounded text-sm underline">{t('backHome')}</Link>
      </form>
    </main>
  )
}

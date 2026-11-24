import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../lib/i18n'
import { LangToggle } from '../components/LangToggle'

export default function Login() {
  const { session, signIn } = useAuth()
  const { t } = useI18n()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/admin" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const err = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError(t('loginFailed')); else nav('/admin', { replace: true })
  }

  return (
    <main className="min-h-screen grid place-items-center p-4 bg-gradient-to-b from-ink-900 to-ink-800">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <h1 className="font-display text-3xl text-gold-400">{t('appName')}</h1>
        <label className="block">{t('email')}
          <input className="input mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">{t('password')}
          <input className="input mt-1" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy} type="submit">{t('signIn')}</button>
          <LangToggle />
        </div>
      </form>
    </main>
  )
}

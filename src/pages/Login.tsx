import { FzMark } from '../brand/Logo'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../lib/i18n'
import { APP_VARIANT, defaultAuthenticatedPath } from '../lib/appVariant'
import { LangToggle } from '../components/LangToggle'

export default function Login() {
  const { session, signIn } = useAuth()
  const { t } = useI18n()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={defaultAuthenticatedPath(APP_VARIANT)} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const err = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError(t('loginFailed')); else nav(defaultAuthenticatedPath(APP_VARIANT), { replace: true })
  }

  return (
    <main className="fz-page grid place-items-center p-4">
      <form onSubmit={submit} className="fz-card w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-3 text-center"><FzMark size={72} /><h1 className="fz-display text-3xl">{t('appName')}</h1></div>
        <label className="block">{t('email')}
          <input className="fz-input mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">{t('password')}
          <input className="fz-input mt-1" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-fz-danger">{error}</p>}
        <div className="flex gap-2">
          <button className="fz-btn fz-btn-primary flex-1" disabled={busy} type="submit">{t('signIn')}</button>
          <LangToggle />
        </div>
      </form>
    </main>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useI18n, type Key } from '../lib/i18n'
import { LangToggle } from '../components/LangToggle'
import { joinRoom, previewRoom } from '../rooms/api'
import { isValidCode, normalizeCode } from '../rooms/util'
import { errorKey } from '../stories/errors'

const STATUS_MSG: Record<string, Key> = {
  not_found: 'roomNotFound', closed: 'roomClosed', bad_pin: 'badPin', too_many_attempts: 'tooManyAttempts', rejected: 'rejectedMsg'
}

export default function Join() {
  const { code: urlCode } = useParams<{ code: string }>()
  const { session, loading, signInAnonymously } = useAuth()
  const { t } = useI18n()
  const nav = useNavigate()
  const [code, setCode] = useState(normalizeCode(urlCode ?? ''))
  const [name, setName] = useState(() => localStorage.getItem('playerName') ?? '')
  const [pin, setPin] = useState('')
  const [needsPin, setNeedsPin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Ask the server whether this room needs a PIN (only possible once there is a session).
  useEffect(() => {
    if (!session || !isValidCode(code)) { setNeedsPin(false); return }
    previewRoom(code).then((p) => setNeedsPin(Boolean(p.found && p.needs_pin))).catch(() => setNeedsPin(false))
  }, [session, code])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValidCode(code) || !name.trim()) return
    setBusy(true); setError(null)
    try {
      if (!session) {
        const err = await signInAnonymously(name.trim())
        if (err) { setError(t('errGeneric')); setBusy(false); return }
      }
      const r = await joinRoom(code, pin || null, name.trim())
      localStorage.setItem('playerName', name.trim())
      if ((r.status === 'joined' || r.status === 'pending') && r.room_id) { nav(`/play/${r.room_id}`, { replace: true }); return }
      setError(t(STATUS_MSG[r.status] ?? 'errGeneric'))
      if (r.status === 'bad_pin') setNeedsPin(true)
    } catch (err) { setError(t(errorKey(err))) }
    setBusy(false)
  }

  if (loading) return <p className="p-6" role="status">{t('loading')}</p>
  return (
    <main className="min-h-screen grid place-items-center p-4 bg-gradient-to-b from-ink-900 to-ink-800">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <h1 className="font-display text-3xl text-gold-400">{t('joinRoomTitle')}</h1>
        <label className="block">{t('roomCodeInput')}
          <input className="input mt-1 text-center font-display text-2xl tracking-widest" dir="ltr" autoCapitalize="characters" autoComplete="off" required
            value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="XX-ABC123" />
        </label>
        <label className="block">{t('yourName')}
          <input className="input mt-1" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </label>
        {(needsPin || pin) && (
          <label className="block">{t('pinInput')}
            <input className="input mt-1" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" />
          </label>
        )}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy || !isValidCode(code)} type="submit">{t('joinBtn')}</button>
          <LangToggle />
        </div>
      </form>
    </main>
  )
}

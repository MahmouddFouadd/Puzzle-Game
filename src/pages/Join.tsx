import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useI18n, type Key } from '../lib/i18n'
import { LangToggle } from '../components/LangToggle'
import { Link } from 'react-router-dom'
import { PuzzleArt } from '../components/StoryArt'
import { joinRoom, previewRoom } from '../rooms/api'
import { isValidCode, normalizeCode } from '../rooms/util'
import { errorKey } from '../stories/errors'

const STATUS_MSG: Record<string, Key> = {
  not_found: 'roomNotFound', closed: 'roomClosed', bad_pin: 'badPin', too_many_attempts: 'tooManyAttempts', rejected: 'rejectedMsg'
}

export default function Join() {
  const { code: urlCode } = useParams<{ code: string }>()
  const { session, loading, signInAnonymously } = useAuth()
  const { t, lang } = useI18n()
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
    <main className="min-h-screen">
      <div className="game-shell space-y-5">
      <div className="flex items-center justify-between"><Link to="/" className="btn-ghost">{t('backHome')}</Link><Link to="/play/new" className="text-sm underline opacity-80">{lang === 'ar' ? '➕ اعمل غرفتك' : '➕ Create your own room'}</Link><LangToggle /></div>
      <form onSubmit={submit} className="story-panel pop-in w-full space-y-4">
        <div className="flex items-center gap-3">
          <PuzzleArt className="h-16 w-16 shrink-0" />
          <h1 className="hero-title text-3xl">{t('joinRoomTitle')}</h1>
        </div>
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
        <button className="btn-primary w-full py-3 text-lg" disabled={busy || !isValidCode(code)} type="submit">{busy ? '…' : t('joinBtn')}</button>
      </form>
      <ol className="story-panel grid grid-cols-3 gap-2 text-center text-xs text-parchment-100/80" aria-label={t('howToPlay')}>
        <li><div className="font-display text-2xl text-gold-400">1</div>{t('stepJoin')}</li>
        <li><div className="font-display text-2xl text-gold-400">2</div>{t('stepAnswer')}</li>
        <li><div className="font-display text-2xl text-gold-400">3</div>{t('stepReveal')}</li>
      </ol>
      </div>
    </main>
  )
}

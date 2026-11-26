import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { bakasaError, joinRoom, previewRoom } from '../../bakasa/api'
import { AvatarPicker, BakasaLogo, randomAvatar } from '../../bakasa/ui'

const stored = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const normalize = (v: string) => {
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = raw.startsWith('BK') ? raw.slice(2) : raw
  return body ? `BK-${body.slice(0, 6)}` : ''
}
type Preview = Awaited<ReturnType<typeof previewRoom>>

export default function BakasaJoin() {
  const { code: urlCode } = useParams<{ code: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const [code, setCode] = useState(normalize(urlCode ?? ''))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [nickname, setNickname] = useState(() => stored('playerName', ''))
  const [avatar, setAvatar] = useState(() => stored('bakasaAvatar', randomAvatar()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^BK-[A-Z0-9]{6}$/.test(code)

  const lookup = async (c: string) => {
    setBusy(true); setError(null)
    try {
      const p = await previewRoom(c)
      if (!p.found) setError(ar ? 'الكود ده مش موجود أو الغرفة اتقفلت. اتأكد من الكود.' : 'That code does not exist or the room is closed.')
      else if (p.status === 'FINISHED' && !p.already_member) setError(ar ? 'المباراة دي خلصت. اطلب من صاحب الغرفة يبدأ مباراة جديدة.' : 'This match has finished.')
      else if ((p.players ?? 0) >= (p.max_players ?? 0) && !p.already_member) setError(ar ? 'الغرفة كاملة.' : 'The room is full.')
      setPreview(p.found ? p : null)
    } catch (e) { setError(bakasaError(e, ar)) }
    setBusy(false)
  }
  useEffect(() => { if (urlCode && valid) void lookup(code) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e: FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return
    setBusy(true); setError(null)
    try {
      const r = await joinRoom(code, nickname.trim(), avatar)
      try { localStorage.setItem('playerName', nickname.trim()); localStorage.setItem('bakasaAvatar', avatar) } catch { /* ignore */ }
      if (r.status === 'joined' && r.room_id) { nav(`/bakasa/room/${r.room_id}`, { replace: true }); return }
      const msg: Record<string, [string, string]> = {
        not_found: ['الكود ده مش موجود.', 'Room not found.'], full: ['الغرفة كاملة.', 'The room is full.'],
        kicked: ['المضيف طلّعك من الغرفة دي.', 'The host removed you from this room.'], finished: ['المباراة خلصت.', 'The match has finished.']
      }
      setError((msg[r.status] ?? ['حصلت مشكلة.', 'Something went wrong.'])[ar ? 0 : 1])
    } catch (err) { setError(bakasaError(err, ar)) }
    setBusy(false)
  }

  return (
    <main className="bakasa">
      <div className="bk-shell space-y-4">
        <div className="flex items-center justify-between"><Link to="/bakasa" className="bk-btn-ghost">{ar ? 'رجوع' : 'Back'}</Link><BakasaLogo small /></div>
        <h1 className="bk-title text-3xl">{ar ? 'ادخل غرفة' : 'Join a room'}</h1>
        {!preview ? (
          <form className="bk-panel space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) void lookup(code) }}>
            <label className="block space-y-2"><span className="font-semibold">{ar ? 'كود الغرفة' : 'Room code'}</span>
              <input className="bk-input text-center font-display text-3xl tracking-[.25em]" dir="ltr" autoCapitalize="characters" autoComplete="off"
                placeholder="BK-XXXXXX" value={code} onChange={(e) => setCode(normalize(e.target.value))} aria-invalid={!!error} /></label>
            {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
            <button className="bk-btn w-full" disabled={!valid || busy} type="submit">{busy ? (ar ? 'بندوّر…' : 'Looking…') : (ar ? 'دوّر على الغرفة' : 'Find room')}</button>
            <p className="text-center text-xs opacity-70">{ar ? 'أو افتح رابط الدعوة / امسح الـ QR من موبايل صاحبك' : 'Or open the invite link / scan the QR code'}</p>
          </form>
        ) : (
          <form className="bk-panel bk-pop space-y-4" onSubmit={join}>
            <div className="rounded-2xl bg-white/5 p-4 text-center">
              <div className="text-sm opacity-70">🕵️ {ar ? 'بكاسة – مين البِكس؟' : 'Bakasa – Hidden Spy'}</div>
              <div className="font-display text-2xl text-bk-accent">{preview.name}</div>
              <div className="mt-1 text-sm">{ar ? 'المضيف' : 'Host'}: <b>{preview.host}</b> · 👥 {preview.players}/{preview.max_players}</div>
              {preview.status !== 'LOBBY' && <div className="mt-1 text-xs text-bk-cyan">{ar ? 'اللعب شغال – هتنضم وتلعب من الجولة الجاية' : 'Game in progress – you will play from the next round'}</div>}
            </div>
            <label className="block space-y-1"><span className="text-sm font-semibold">{ar ? 'اسمك' : 'Your nickname'}</span>
              <input className="bk-input" required maxLength={30} value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="nickname" /></label>
            <div className="space-y-1"><span className="text-sm font-semibold">{ar ? 'شخصيتك' : 'Your avatar'}</span><AvatarPicker value={avatar} onChange={setAvatar} /></div>
            {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="bk-btn-ghost" onClick={() => { setPreview(null); setError(null) }}>{ar ? 'تغيير' : 'Change'}</button>
              <button className="bk-btn col-span-2" disabled={busy || !nickname.trim()} type="submit">{busy ? '…' : (ar ? 'ادخل 🚪' : 'Join 🚪')}</button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}

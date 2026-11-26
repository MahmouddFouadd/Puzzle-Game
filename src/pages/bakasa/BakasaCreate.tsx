import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { bakasaError, createRoom, DEFAULT_SETTINGS, type BakasaSettings } from '../../bakasa/api'
import { AvatarPicker, BakasaLogo, randomAvatar } from '../../bakasa/ui'
import { SettingsForm, SettingsSummary } from '../../bakasa/SettingsForm'

const stored = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

export default function BakasaCreate() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const [nickname, setNickname] = useState(() => stored('playerName', ''))
  const [avatar, setAvatar] = useState(() => stored('bakasaAvatar', randomAvatar()))
  const [name, setName] = useState(() => (stored('playerName', '') ? `غرفة ${stored('playerName', '')}` : ''))
  const [settings, setSettings] = useState<BakasaSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return
    setBusy(true); setError(null)
    try {
      const r = await createRoom(name.trim() || (ar ? 'غرفة بكاسة' : 'Bakasa room'), nickname.trim(), avatar, settings)
      try { localStorage.setItem('playerName', nickname.trim()); localStorage.setItem('bakasaAvatar', avatar) } catch { /* ignore */ }
      nav(`/bakasa/room/${r.room_id}`, { replace: true })
    } catch (err) { setError(bakasaError(err, ar)); setBusy(false) }
  }

  return (
    <main className="bakasa">
      <form onSubmit={submit} className="bk-shell space-y-4">
        <div className="flex items-center justify-between"><Link to="/bakasa" className="bk-btn-ghost">{ar ? 'رجوع' : 'Back'}</Link><BakasaLogo small /></div>
        <h1 className="bk-title text-3xl">{ar ? 'اعمل غرفة جديدة' : 'Create a room'}</h1>

        <section className="bk-panel space-y-4">
          <label className="block space-y-1"><span className="text-sm font-semibold">{ar ? 'اسمك في اللعبة' : 'Your nickname'}</span>
            <input className="bk-input" required maxLength={30} value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="nickname" /></label>
          <div className="space-y-1"><span className="text-sm font-semibold">{ar ? 'شخصيتك' : 'Your avatar'}</span><AvatarPicker value={avatar} onChange={setAvatar} /></div>
          <label className="block space-y-1"><span className="text-sm font-semibold">{ar ? 'اسم الغرفة' : 'Room name'}</span>
            <input className="bk-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={ar ? 'غرفة الشلة' : 'Friends room'} /></label>
          <p className="text-xs opacity-70">🔒 {ar ? 'الغرفة خاصة: محدش يدخل غير بالكود أو رابط الدعوة.' : 'Private room: players join only with the code or invite link.'}</p>
        </section>

        <section className="bk-panel"><SettingsForm value={settings} onChange={setSettings} /></section>

        <section className="bk-panel space-y-2">
          <h2 className="font-semibold">{ar ? 'ملخص الإعدادات' : 'Summary'}</h2>
          <SettingsSummary s={settings} />
        </section>

        {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
        <button className="bk-btn w-full" type="submit" disabled={busy || !nickname.trim()}>{busy ? '…' : (ar ? 'يلا نعمل الغرفة 🎉' : 'Create room 🎉')}</button>
      </form>
    </main>
  )
}

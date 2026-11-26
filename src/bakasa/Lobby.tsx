import { shareUrl } from '../lib/publicUrl'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useI18n } from '../lib/i18n'
import { bakasaError, kickPlayer, setAvatar, setReady, startRound, transferHost, updateSettings, type BakasaSettings, type BakasaState } from './api'
import { Avatar, AvatarPicker, ConfirmDialog } from './ui'
import { SettingsForm, SettingsSummary } from './SettingsForm'

export function inviteUrl(code: string) { return shareUrl(`/bakasa/join/${code}`) }

export function InvitePanel({ code, url }: { code: string; url?: string }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const link = url ?? inviteUrl(code)
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#120d2b', light: '#ffffff' } }).then(setQr).catch(() => setQr('')) }, [link])
  const copy = (text: string, what: string) => { void navigator.clipboard?.writeText(text).then(() => { setCopied(what); window.setTimeout(() => setCopied(null), 1600) }).catch(() => undefined) }
  const share = () => {
    const n = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> }
    if (n.share) void n.share({ title: url ? 'المحقق' : 'بكاسة', text: url ? (ar ? `تعالى نحقق مع بعض! الكود ${code}` : `Join my investigation! Code ${code}`) : (ar ? `تعالى العب بكاسة معانا! الكود ${code}` : `Join my Bakasa game! Code ${code}`), url: link }).catch(() => undefined)
    else copy(link, 'link')
  }
  return (
    <div className="space-y-3 text-center">
      {qr ? <img src={qr} alt={ar ? 'كود QR للدعوة' : 'Invite QR code'} className="mx-auto h-44 w-44 rounded-2xl bg-white p-2" /> : <div className="mx-auto grid h-44 w-44 place-items-center rounded-2xl bg-white/5 text-sm opacity-60">QR</div>}
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="bk-btn-ghost text-sm" onClick={() => copy(code, 'code')}>{copied === 'code' ? '✓' : '📋'} {ar ? 'الكود' : 'Code'}</button>
        <button type="button" className="bk-btn-ghost text-sm" onClick={() => copy(link, 'link')}>{copied === 'link' ? '✓' : '🔗'} {ar ? 'الرابط' : 'Link'}</button>
        <button type="button" className="bk-btn-ghost text-sm" onClick={share}>📤 {ar ? 'شارك' : 'Share'}</button>
      </div>
      {copied && <p role="status" className="text-sm text-bk-lime">{ar ? 'اتنسخ!' : 'Copied!'}</p>}
    </div>
  )
}

/** Turns a server notice like "join:Ahmed" into an activity line. */
export function noticeText(n: string | null, ar: boolean): string | null {
  if (!n) return null
  const [kind, ...rest] = n.split(':'); const who = rest.join(':')
  const t: Record<string, [string, string]> = {
    join: [`انضم ${who} للغرفة! 👋`, `${who} joined! 👋`], ready: [`${who} بقى جاهز ✅`, `${who} is ready ✅`], left: [`${who} خرج من الغرفة`, `${who} left the room`],
    settings: ['المضيف غيّر إعدادات الجولة ⚙️', 'The host changed the settings ⚙️'], host: [`${who} بقى المضيف الجديد 👑`, `${who} is the new host 👑`],
    rematch: ['مباراة جديدة! النقاط اتصفّرت 🔁', 'Rematch! Scores reset 🔁'], tie_revote: ['تعادل! إعادة تصويت ⚖️', 'Tie! Revote ⚖️'],
    abandoned: ['الجولة اتلغت عشان لاعبين خرجوا', 'The round was cancelled because players left'],
    questions_done: ['انتهت فترة الأسئلة ⏸️', 'Question time is over ⏸️'], more_questions: ['جولة أسئلة كمان! 💬', 'Another round of questions! 💬'],
    spy_guess: ['البِكس بيخمّن الكلمة… 🤔', 'The spy is guessing the word… 🤔'], voting: ['يلا نصوّت! 🗳️', 'Time to vote! 🗳️']
  }
  return t[kind] ? t[kind][ar ? 0 : 1] : null
}

export function LobbyView({ state, reload }: { state: BakasaState; reload: () => Promise<void> }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const { room, players, me } = state
  const isHost = room.host_id === me
  const active = players.filter((p) => p.status === 'ACTIVE')
  const mine = players.find((p) => p.user_id === me)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BakasaSettings>(room.settings)
  const [draftName, setDraftName] = useState(room.name)
  const [pickAvatar, setPickAvatar] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'kick' | 'host'; user: string; name: string } | null>(null)
  const [showInvite, setShowInvite] = useState(active.length < 3)
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await reload() } catch (e) { setError(bakasaError(e, ar)) } setBusy(false) }

  const minNeeded = Math.max(3, room.settings.min_players)
  const notReady = active.filter((p) => !p.is_ready && p.user_id !== room.host_id)
  const blocker = active.length < minNeeded
    ? (ar ? `محتاجين ${minNeeded - active.length} لاعب كمان عشان نبدأ` : `Need ${minNeeded - active.length} more player(s) to start`)
    : notReady.length > 0 && room.status === 'LOBBY'
      ? (ar ? `مستنيين: ${notReady.map((p) => p.nickname).join('، ')}` : `Waiting for: ${notReady.map((p) => p.nickname).join(', ')}`)
      : null
  const slots = Math.max(0, minNeeded - active.length)

  return (
    <div className="space-y-4">
      <section className="bk-panel space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl">👥 {ar ? 'اللاعبين' : 'Players'} <span className="text-bk-accent">{active.length}/{room.settings.max_players}</span></h2>
          <button type="button" className="bk-btn-ghost min-h-0 py-1.5 text-sm" onClick={() => setShowInvite((v) => !v)} aria-expanded={showInvite}>➕ {ar ? 'ادعي صحابك' : 'Invite'}</button>
        </div>
        {showInvite && <div className="bk-pop rounded-2xl bg-white/5 p-3"><InvitePanel code={room.code} /></div>}
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {active.map((p) => (
            <li key={p.user_id} className={`bk-pop flex flex-col items-center gap-1 rounded-2xl p-2 text-center ${p.user_id === me ? 'bg-bk-accent/15 ring-2 ring-bk-accent/60' : 'bg-white/5'}`}>
              <Avatar avatar={p.avatar} size={60} dim={!p.online} ring={p.is_ready || p.user_id === room.host_id ? '#7bd96a' : undefined}
                badge={p.user_id === room.host_id ? '👑' : p.is_ready ? '✅' : undefined} />
              <span className="w-full truncate text-sm font-semibold">{p.nickname}</span>
              <span className={`text-[11px] ${p.online ? 'text-bk-lime' : 'text-[#ff9b9b]'}`}>{p.online ? (p.user_id === room.host_id ? (ar ? 'المضيف' : 'Host') : p.is_ready ? (ar ? 'جاهز' : 'Ready') : (ar ? 'مش جاهز' : 'Not ready')) : (ar ? 'بيحاول يرجع…' : 'Reconnecting…')}</span>
              {isHost && p.user_id !== me && (
                <div className="flex gap-1">
                  <button type="button" className="rounded-full bg-white/10 px-2 text-xs" aria-label={ar ? `اجعل ${p.nickname} المضيف` : `Make ${p.nickname} host`} onClick={() => setConfirm({ kind: 'host', user: p.user_id, name: p.nickname })}>👑</button>
                  <button type="button" className="rounded-full bg-white/10 px-2 text-xs" aria-label={ar ? `طلّع ${p.nickname}` : `Remove ${p.nickname}`} onClick={() => setConfirm({ kind: 'kick', user: p.user_id, name: p.nickname })}>✖</button>
                </div>
              )}
            </li>
          ))}
          {Array.from({ length: slots }).map((_, i) => (
            <li key={`slot-${i}`} className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/15 p-2 text-center text-xs opacity-60">
              <span className="text-2xl">❔</span>{ar ? 'مكان فاضي' : 'Open seat'}</li>
          ))}
        </ul>
        {players.some((p) => p.status === 'LEFT') && <p className="text-xs opacity-60">{ar ? 'خرجوا: ' : 'Left: '}{players.filter((p) => p.status === 'LEFT').map((p) => p.nickname).join('، ')}</p>}
      </section>

      {mine && (
        <section className="bk-panel space-y-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPickAvatar((v) => !v)} aria-label={ar ? 'غيّر شخصيتك' : 'Change avatar'}><Avatar avatar={mine.avatar} size={48} /></button>
            <div className="flex-1"><div className="font-semibold">{mine.nickname}</div><div className="text-xs opacity-70">{ar ? 'اضغط على الشخصية لتغييرها' : 'Tap your avatar to change it'}</div></div>
          </div>
          {pickAvatar && <AvatarPicker value={mine.avatar} onChange={(a) => { setPickAvatar(false); void run(() => setAvatar(room.id, a)) }} />}
          {!isHost && room.status === 'LOBBY' && (
            <button type="button" disabled={busy} className={mine.is_ready ? 'bk-btn-ghost w-full' : 'bk-btn w-full'} onClick={() => void run(() => setReady(room.id, !mine.is_ready))}>
              {mine.is_ready ? (ar ? 'مش جاهز لسه' : 'Not ready') : (ar ? 'أنا جاهز! ✅' : "I'm ready! ✅")}</button>
          )}
        </section>
      )}

      <section className="bk-panel space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold">⚙️ {ar ? 'إعدادات الجولة' : 'Round settings'}</h2>
          {isHost && !editing && <button type="button" className="text-sm underline" onClick={() => { setDraft(room.settings); setDraftName(room.name); setEditing(true) }}>{ar ? 'تعديل' : 'Edit'}</button>}</div>
        {editing ? (
          <div className="space-y-4">
            <label className="block space-y-1"><span className="text-sm">{ar ? 'اسم الغرفة' : 'Room name'}</span><input className="bk-input" maxLength={60} value={draftName} onChange={(e) => setDraftName(e.target.value)} /></label>
            <SettingsForm value={draft} onChange={setDraft} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="bk-btn-ghost" onClick={() => setEditing(false)}>{ar ? 'إلغاء' : 'Cancel'}</button>
              <button type="button" className="bk-btn" disabled={busy} onClick={() => void run(async () => { await updateSettings(room.id, draftName, draft); setEditing(false) })}>{ar ? 'حفظ' : 'Save'}</button>
            </div>
          </div>
        ) : <SettingsSummary s={room.settings} />}
      </section>

      {error && <p role="alert" className="rounded-2xl bg-[#ff5d5d]/20 p-3 text-center">{error}</p>}
      {isHost ? (
        <div className="sticky bottom-3 z-10 space-y-2">
          {blocker && <p className="rounded-2xl bg-bk-900/90 p-2 text-center text-sm" role="status">⏳ {blocker}</p>}
          <button type="button" className="bk-btn w-full text-xl" disabled={busy || !!blocker} onClick={() => void run(() => startRound(room.id))}>
            {room.status === 'RESULT' ? (ar ? `ابدأ الجولة ${room.round_no + 1} ▶` : `Start round ${room.round_no + 1} ▶`) : (ar ? 'ابدأ اللعبة ▶' : 'Start game ▶')}</button>
        </div>
      ) : (
        <p className="rounded-2xl bg-white/5 p-3 text-center text-sm" role="status">{ar ? 'مستنيين المضيف يبدأ اللعبة…' : 'Waiting for the host to start…'}</p>
      )}

      <ConfirmDialog open={confirm?.kind === 'kick'} title={ar ? `تطلّع ${confirm?.name}؟` : `Remove ${confirm?.name}?`}
        body={ar ? 'مش هيقدر يرجع للغرفة دي تاني.' : 'They will not be able to rejoin this room.'} confirm={ar ? 'طلّعه' : 'Remove'}
        onConfirm={() => confirm && void run(() => kickPlayer(room.id, confirm.user))} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.kind === 'host'} title={ar ? `تخلّي ${confirm?.name} المضيف؟` : `Make ${confirm?.name} host?`}
        body={ar ? 'هو اللي هيتحكم في الإعدادات وبدء الجولات.' : 'They will control settings and start rounds.'} confirm={ar ? 'أيوه' : 'Yes'}
        onConfirm={() => confirm && void run(() => transferHost(room.id, confirm.user))} onClose={() => setConfirm(null)} />
    </div>
  )
}

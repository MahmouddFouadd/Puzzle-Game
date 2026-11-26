import { shareUrl } from '../lib/publicUrl'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { detectiveError, joinParty, partyLeave, partyReady, partyStart, partyState, type PartyState } from '../detective/api'
import { Avatar, AvatarPicker, randomAvatar } from '../bakasa/ui'
import { InvitePanel } from '../bakasa/Lobby'
import { imageUrl, Stars } from './DetectiveCatalog'
import { VoiceBar } from '../voice/VoiceBar'

export const partyUrl = (code: string) => shareUrl(`/detective/join/${code}`)
const stored = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

/** Live party leaderboard (used in the lobby and as a strip inside the investigation). */
export function PartyBoard({ s, compact }: { s: PartyState; compact?: boolean }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const coop = s.party.mode === 'COOPERATIVE'
  const team = s.members.reduce((n, m) => n + (m.score ?? 0), 0)
  return (
    <section className={compact ? 'det-panel !p-3' : 'det-panel'} aria-label={ar ? 'لوحة الفريق' : 'Team board'}>
      <div className="mb-2 flex items-center justify-between text-sm">
        <b>{coop ? (ar ? '🤝 الفريق' : '🤝 Team') : (ar ? '🏁 السباق' : '🏁 Race')}</b>
        {coop && <span className="det-chip text-[#f5c46b]" dir="ltr">★ {team}</span>}
      </div>
      <ol className={compact ? 'flex gap-2 overflow-x-auto' : 'space-y-2'}>
        {s.members.map((m, i) => (
          <li key={m.user_id} className={compact ? 'flex shrink-0 items-center gap-2 rounded-xl bg-[#14233a] px-2 py-1.5 text-xs' : `flex items-center gap-3 rounded-xl p-2 ${m.user_id === s.me ? 'bg-[#f5a623]/15' : 'bg-[#14233a]'}`}>
            {!coop && <span className="w-5 text-center">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>}
            <Avatar avatar={m.avatar} size={compact ? 26 : 38} badge={m.user_id === s.party.host_id ? '👑' : m.completed_at ? '✅' : undefined} />
            <span className={`truncate font-semibold ${compact ? 'max-w-[5rem]' : 'flex-1'}`}>{m.nickname}</span>
            {s.party.status !== 'LOBBY' && <>
              {!compact && <span className="text-xs text-[#9fb0c4]">🔎 {m.found}/{s.evidence_total} · ❓ {m.correct}/{m.answered}</span>}
              <b className="text-[#f5c46b]" dir="ltr">{m.score ?? 0}</b>
            </>}
            {s.party.status === 'LOBBY' && !compact && <span className={`text-xs ${m.is_ready ? 'text-[#4ade80]' : 'text-[#9fb0c4]'}`}>{m.is_ready ? (ar ? 'جاهز ✓' : 'Ready ✓') : (ar ? 'مش جاهز' : 'Not ready')}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function usePartyState(partyId: string | undefined, interval = 3000) {
  const [s, setS] = useState<PartyState | null>(null)
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => { if (!partyId) return; try { setS(await partyState(partyId)); setError(null) } catch (e) { setError(e) } }, [partyId])
  useEffect(() => { void load(); const id = window.setInterval(() => { void load() }, interval); return () => window.clearInterval(id) }, [load, interval])
  return { s, error, reload: load }
}

export default function DetectiveParty() {
  const { partyId } = useParams<{ partyId: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const { s, error, reload } = usePartyState(partyId)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (s?.party.status === 'PLAYING' && s.my_session) nav(`/detective/session/${s.my_session}`, { replace: true }) }, [s, nav])
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setMsg(null); try { await fn(); await reload() } catch (e) { setMsg(detectiveError(e, ar)) } setBusy(false) }

  if (!s) return <main className="det grid place-items-center p-6"><div className="det-panel space-y-3 text-center">
    {error ? <><p role="alert">{ar ? 'مقدرناش نفتح غرفة التحقيق.' : 'Could not open the investigation room.'}</p><Link className="det-btn" to="/detective/join">{ar ? 'ادخل بكود' : 'Join with a code'}</Link></> : <p role="status">{ar ? 'بنجهّز غرفة التحقيق…' : 'Preparing the room…'}</p>}</div></main>
  const isHost = s.party.host_id === s.me
  const me = s.members.find((m) => m.user_id === s.me)
  const notReady = s.members.filter((m) => !m.is_ready && m.user_id !== s.party.host_id)
  const blocker = s.members.length < 2 ? (ar ? 'محتاجين محقق تاني على الأقل' : 'Need at least one more detective') : notReady.length ? (ar ? `مستنيين: ${notReady.map((m) => m.nickname).join('، ')}` : `Waiting for: ${notReady.map((m) => m.nickname).join(', ')}`) : null
  const coop = s.party.mode === 'COOPERATIVE'

  return (
    <main className="det"><div className="det-shell space-y-4">
      <header className="flex items-center justify-between"><Link to="/detective" className="det-btn-ghost min-h-0 py-2 text-sm">{ar ? '→ القضايا' : '← Cases'}</Link>
        <span className="font-mono text-sm tracking-widest text-[#f5c46b]" dir="ltr">{s.party.code}</span></header>
      {s.party.status !== 'CLOSED' && <VoiceBar kind="detective" roomId={s.party.id} selfId={s.me} names={Object.fromEntries(s.members.map((m) => [m.user_id, m.nickname]))} />}
      <section className="relative overflow-hidden rounded-2xl border border-[#2a3a52]">
        {s.case.cover_image_path && <img src={imageUrl(s.case.cover_image_path)} alt="" className="aspect-[21/9] w-full object-cover opacity-60" />}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#0b1220] to-transparent p-4">
          <span className="text-xs font-bold uppercase tracking-[.3em] text-[#2dd4bf]">{coop ? (ar ? 'تحقيق جماعي · فريق واحد' : 'Team investigation') : (ar ? 'منافسة · كل محقق لوحده' : 'Competition · solo race')}</span>
          <h1 className="det-title">{ar ? s.case.title_ar : s.case.title}</h1><Stars n={s.case.difficulty} />
        </div>
      </section>
      <p className="det-panel text-sm text-[#cdd8e5]">{coop
        ? (ar ? '🤝 هتحققوا في نفس القضية مع بعض: أي دليل حد يلاقيه يظهر للكل، والإجابة بتتحسب للفريق، ولوحة الأدلة مشتركة.' : '🤝 You investigate the same case together: clues, answers and the evidence board are shared.')
        : (ar ? '🏁 كل محقق بيحقق لوحده في نفس القضية، والترتيب بيتحدّث مباشرة. الأسرع والأدق يكسب!' : '🏁 Everyone investigates the same case alone with a live leaderboard. Fastest and most accurate wins!')}</p>

      {s.party.status === 'LOBBY' && <>
        <section className="det-panel"><InvitePanel code={s.party.code} url={partyUrl(s.party.code)} /></section>
        <PartyBoard s={s} />
        {msg && <p className="det-panel text-[#ff8a8d]" role="alert">{msg}</p>}
        {isHost ? (<div className="space-y-2">
          {blocker && <p className="text-center text-sm text-[#9fb0c4]" role="status">⏳ {blocker}</p>}
          <button type="button" className="det-btn w-full text-lg" disabled={busy || !!blocker} onClick={() => void run(() => partyStart(s.party.id))}>🔍 {ar ? 'ابدأوا التحقيق' : 'Start the investigation'}</button></div>)
          : me && <button type="button" className={me.is_ready ? 'det-btn-ghost w-full' : 'det-btn w-full'} disabled={busy} onClick={() => void run(() => partyReady(s.party.id, !me.is_ready))}>{me.is_ready ? (ar ? 'مش جاهز لسه' : 'Not ready') : (ar ? 'أنا جاهز ✓' : "I'm ready ✓")}</button>}
        <button type="button" className="mx-auto block text-sm text-[#ff8a8d] underline" onClick={() => void run(async () => { await partyLeave(s.party.id); nav('/detective') })}>{ar ? 'اخرج من الغرفة' : 'Leave the room'}</button>
      </>}
      {s.party.status === 'PLAYING' && !s.my_session && <p className="det-panel" role="status">{ar ? 'بنجهّز ملفك…' : 'Preparing your file…'}</p>}
      {s.party.status === 'FINISHED' && <>
        <PartyBoard s={s} />
        {s.my_session && <Link className="det-btn w-full" to={`/detective/report/${s.my_session}`}>📄 {ar ? 'تقرير التحقيق' : 'Investigation report'}</Link>}
      </>}
    </div></main>
  )
}

export function DetectiveJoin() {
  const { code: urlCode } = useParams<{ code: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const [code, setCode] = useState((urlCode ?? '').toUpperCase())
  const [name, setName] = useState(() => stored('playerName', ''))
  const [avatar, setAvatar] = useState(() => stored('bakasaAvatar', randomAvatar()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const normalized = (() => { const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, ''); const b = raw.startsWith('DT') ? raw.slice(2) : raw; return b ? `DT-${b.slice(0, 6)}` : '' })()
  const submit = async (e?: FormEvent) => {
    e?.preventDefault(); if (!name.trim()) return
    setBusy(true); setError(null)
    try {
      const r = await joinParty(normalized, name.trim(), avatar)
      try { localStorage.setItem('playerName', name.trim()); localStorage.setItem('bakasaAvatar', avatar) } catch { /* ignore */ }
      if (r.status === 'joined' && r.party_id) { nav(`/detective/party/${r.party_id}`, { replace: true }); return }
      setError(r.status === 'full' ? (ar ? 'الغرفة كاملة.' : 'The room is full.') : (ar ? 'الكود ده مش موجود أو التحقيق خلص.' : 'Code not found or the investigation ended.'))
    } catch (err) { setError(detectiveError(err, ar)) }
    setBusy(false)
  }
  // Invite links go straight into the room when the player already has a saved name.
  useEffect(() => { if (urlCode && /^DT-[A-Z0-9]{6}$/.test(normalized) && name.trim()) void submit() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="det"><form onSubmit={submit} className="det-shell space-y-4">
      <Link to="/detective" className="det-btn-ghost min-h-0 py-2 text-sm">{ar ? '→ القضايا' : '← Cases'}</Link>
      <h1 className="det-title">{ar ? 'انضم لتحقيق جماعي' : 'Join a team investigation'}</h1>
      <section className="det-panel space-y-4">
        <label className="block space-y-1"><span className="text-sm">{ar ? 'كود الغرفة' : 'Room code'}</span>
          <input className="w-full rounded-xl border border-[#2f4462] bg-[#0d1626] px-3 py-3 text-center font-mono text-2xl tracking-[.3em]" dir="ltr" value={normalized} onChange={(e) => setCode(e.target.value)} placeholder="DT-XXXXXX" autoCapitalize="characters" /></label>
        <label className="block space-y-1"><span className="text-sm">{ar ? 'اسمك كمحقق' : 'Your detective name'}</span>
          <input className="w-full rounded-xl border border-[#2f4462] bg-[#0d1626] px-3 py-2.5" maxLength={30} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" /></label>
        <div className="space-y-1"><span className="text-sm">{ar ? 'شخصيتك' : 'Your avatar'}</span><AvatarPicker value={avatar} onChange={setAvatar} /></div>
        {error && <p className="text-[#ff8a8d]" role="alert">{error}</p>}
        <button className="det-btn w-full" type="submit" disabled={busy || !/^DT-[A-Z0-9]{6}$/.test(normalized) || !name.trim()}>{busy ? '…' : (ar ? 'ادخل الغرفة 🔍' : 'Join 🔍')}</button>
      </section>
    </form></main>
  )
}

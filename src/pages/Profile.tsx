import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useAuth } from '../auth/AuthProvider'
import { myHistory, type HistoryRow } from '../bakasa/api'
import { AvatarPicker } from '../bakasa/ui'
import { FramedAvatar, TabBar, usePlayerIdentity } from '../components/ArcadeChrome'

/** Player profile: local identity plus real stats from played Bakasa matches. */
export default function Profile() {
  const { lang, toggle } = useI18n()
  const ar = lang === 'ar'
  const { session } = useAuth()
  const { name, avatar, setName, setAvatar } = usePlayerIdentity()
  const [draft, setDraft] = useState(name)
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  useEffect(() => { if (session) myHistory().then(setRows).catch(() => setRows([])); else setRows([]) }, [session])
  const matches = rows?.length ?? 0
  const points = rows?.reduce((s, r) => s + r.my_score, 0) ?? 0
  const wins = rows?.filter((r) => r.top_score > 0 && r.my_score === r.top_score).length ?? 0
  const hour = new Date().getHours()

  return (
    <main className="arcade">
      <div className="ar-shell space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/" className="ar-icon" aria-label={ar ? 'الرئيسية' : 'Home'}>{ar ? '→' : '←'}</Link>
          <button type="button" className="ar-icon text-sm font-bold" onClick={toggle}>{ar ? 'EN' : 'ع'}</button>
        </header>

        <section className="space-y-3 text-center">
          <button type="button" onClick={() => setEditing((v) => !v)} aria-label={ar ? 'غيّر شخصيتك' : 'Change avatar'} className="mx-auto block"><FramedAvatar avatar={avatar} size={110} /></button>
          {editing ? (
            <form className="mx-auto flex max-w-xs gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setName(draft.trim().slice(0, 30)); setEditing(false) } }}>
              <input className="w-full rounded-2xl border border-white/10 bg-[#1b1b25] px-3 py-2 text-center" maxLength={30} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={ar ? 'اسمك' : 'Your name'} autoFocus />
              <button className="ar-btn min-h-0 px-4 py-2" type="submit">{ar ? 'حفظ' : 'Save'}</button>
            </form>
          ) : (
            <div>
              <h1 className="text-2xl font-bold">{(ar ? (hour < 12 ? 'صباح الخير' : 'مساء الخير') : (hour < 12 ? 'Good morning' : 'Good evening'))}{name ? (ar ? ` يا ${name}!` : `, ${name}!`) : '!'}</h1>
              <button type="button" className="text-sm text-[#a78bfa] underline" onClick={() => { setDraft(name); setEditing(true) }}>{ar ? 'عدّل اسمك وشخصيتك' : 'Edit name & avatar'}</button>
            </div>
          )}
          {editing && <div className="ar-card mx-auto max-w-sm p-3"><AvatarPicker value={avatar} onChange={setAvatar} /></div>}
        </section>

        <section className="ar-card grid grid-cols-3 divide-x divide-white/10 p-4 text-center rtl:divide-x-reverse" aria-label={ar ? 'إحصائياتي' : 'My stats'}>
          <div><div className="text-xs text-white/50">{ar ? 'مباريات' : 'Matches'}</div><div className="text-xl font-bold">{rows === null ? '…' : matches}</div></div>
          <div><div className="text-xs text-white/50">{ar ? 'مرات الفوز' : 'Wins'}</div><div className="text-xl font-bold">{rows === null ? '…' : wins}</div></div>
          <div><div className="text-xs text-white/50">{ar ? 'نقاطي' : 'Points'}</div><div className="text-xl font-bold">{rows === null ? '…' : points}</div></div>
        </section>
        <p className="-mt-3 text-center text-[11px] text-white/40">{ar ? 'الإحصائيات من مباريات بكاسة الأونلاين على الجهاز ده' : 'Stats from your online Bakasa matches on this device'}</p>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">{ar ? 'آخر المباريات' : 'Recent games'}</h2>
          {rows !== null && rows.length === 0 && (
            <div className="ar-card space-y-3 p-5 text-center"><p className="text-sm text-white/60">{ar ? 'لسه ملعبتش مباريات أونلاين. يلا أول مباراة!' : 'No online matches yet. Play your first one!'}</p>
              <Link to="/bakasa/create" className="ar-btn">🕵️ {ar ? 'اعمل غرفة بكاسة' : 'Create a Bakasa room'}</Link></div>
          )}
          <ul className="space-y-2">{rows?.slice(0, 8).map((r) => (
            <li key={r.room_id} className="ar-card flex items-center gap-3 p-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl text-xl" style={{ background: 'linear-gradient(160deg,#ff8a3d,#ff5f6d)' }} aria-hidden="true">🕵️</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-xs text-white/50">{new Date(r.created_at).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')} · {r.rounds} {ar ? 'جولات' : 'rounds'}</span></span>
              <span className={`rounded-xl px-2.5 py-1 text-sm font-bold ${r.top_score > 0 && r.my_score === r.top_score ? 'bg-[#22c55e]/20 text-[#4ade80]' : 'bg-white/10'}`}>{r.my_score}</span>
            </li>))}</ul>
          {rows && rows.length > 8 && <Link to="/bakasa/history" className="block text-center text-sm text-[#a78bfa] underline">{ar ? 'كل السجل' : 'Full history'}</Link>}
        </section>
      </div>
      <TabBar />
    </main>
  )
}

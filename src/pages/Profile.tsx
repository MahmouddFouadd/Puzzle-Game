import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { AvatarPicker } from '../bakasa/ui'
import { FramedAvatar, usePlayerIdentity } from '../components/ArcadeChrome'
import { BrandHeader } from '../components/fz/BrandHeader'
import { BottomNav } from '../components/fz/MainNavigation'
import { GameStatistics } from '../components/fz/GameStatistics'
import { RecentGamesSection } from '../components/fz/RecentGamesSection'
import { PrimaryActionButton } from '../components/fz/PrimaryActionButton'
import { useRecentGames } from '../lib/useRecentGames'
import { IconSettings } from '../brand/icons'

/** Player profile: local identity, real stats/history (Bakasa + Detective) and settings. */
export default function Profile() {
  const { lang, toggle } = useI18n()
  const ar = lang === 'ar'
  const { hash } = useLocation()
  const { name, avatar, setName, setAvatar } = usePlayerIdentity()
  const [draft, setDraft] = useState(name)
  const [editing, setEditing] = useState(false)
  const recent = useRecentGames()
  useEffect(() => { if (hash === '#settings') document.getElementById('settings')?.scrollIntoView({ block: 'start' }) }, [hash])

  return (
    <main className="fz-page">
      <BrandHeader />
      <div className="fz-shell mx-auto max-w-3xl space-y-6 pt-6">
        <section className="fz-card space-y-4 p-6 text-center">
          <button type="button" onClick={() => setEditing((v) => !v)} aria-label={ar ? 'غيّر شخصيتك' : 'Change avatar'} className="fz-focus mx-auto block rounded-full"><FramedAvatar avatar={avatar} size={104} /></button>
          {editing ? (
            <form className="mx-auto flex max-w-xs gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setName(draft.trim().slice(0, 30)); setEditing(false) } }}>
              <input className="fz-input text-center" maxLength={30} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={ar ? 'اسمك' : 'Your name'} autoFocus />
              <PrimaryActionButton type="submit">{ar ? 'حفظ' : 'Save'}</PrimaryActionButton>
            </form>
          ) : (
            <div>
              <h1 className="fz-display text-3xl">{name || (ar ? 'لاعب جديد' : 'New player')}</h1>
              <button type="button" className="fz-focus mt-1 rounded text-sm font-bold text-fz-cyan underline" onClick={() => { setDraft(name); setEditing(true) }}>{ar ? 'عدّل اسمك وشخصيتك' : 'Edit name & avatar'}</button>
            </div>
          )}
          {editing && <div className="mx-auto max-w-sm rounded-2xl bg-fz-s2 p-3"><AvatarPicker value={avatar} onChange={setAvatar} /></div>}
        </section>

        <GameStatistics stats={recent.stats} />
        <RecentGamesSection state={recent} />

        <section id="settings" className="fz-card scroll-mt-24 space-y-3 p-5" aria-labelledby="fz-settings-h">
          <h2 id="fz-settings-h" className="fz-display flex items-center gap-2 text-xl"><IconSettings size={22} />{ar ? 'الإعدادات' : 'Settings'}</h2>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-fz-s2 p-3">
            <div><div className="font-bold">{ar ? 'اللغة' : 'Language'}</div><div className="fz-muted text-xs">{ar ? 'العربية (من اليمين للشمال)' : 'English (left to right)'}</div></div>
            <PrimaryActionButton variant="secondary" onClick={toggle}>{ar ? 'English' : 'العربية'}</PrimaryActionButton>
          </div>
        </section>
      </div>
      <BottomNav />
    </main>
  )
}

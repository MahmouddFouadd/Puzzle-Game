import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { Avatar } from '../bakasa/ui'

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

/** The player's local identity (shared with Bakasa / Join). Updates across tabs. */
export function usePlayerIdentity() {
  const [name, setNameState] = useState(() => read('playerName', ''))
  const [avatar, setAvatarState] = useState(() => read('bakasaAvatar', 'fox'))
  useEffect(() => {
    const on = () => { setNameState(read('playerName', '')); setAvatarState(read('bakasaAvatar', 'fox')) }
    window.addEventListener('storage', on); return () => window.removeEventListener('storage', on)
  }, [])
  const setName = (v: string) => { setNameState(v); try { localStorage.setItem('playerName', v) } catch { /* ignore */ } }
  const setAvatar = (v: string) => { setAvatarState(v); try { localStorage.setItem('bakasaAvatar', v) } catch { /* ignore */ } }
  return { name, avatar, setName, setAvatar }
}

export function FramedAvatar({ avatar, size = 48 }: { avatar: string; size?: number }) {
  return <span className="ar-frame"><Avatar avatar={avatar} size={size} /><span className="absolute -bottom-1 text-xs" aria-hidden="true">⭐</span></span>
}

export function TabBar() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const tabs = [
    { to: '/', icon: '🏠', label: ar ? 'الرئيسية' : 'Home', end: true },
    { to: '/bakasa', icon: '🕵️', label: ar ? 'بكاسة' : 'Bakasa' },
    { to: '/join', icon: '🧩', label: ar ? 'أحجية' : 'Puzzle' },
    { to: '/detective', icon: '🔍', label: ar ? 'المحقق' : 'Detective' },
    { to: '/me', icon: '👤', label: ar ? 'ملفي' : 'Me' }
  ]
  return (
    <nav className="ar-tabbar" aria-label={ar ? 'التنقل' : 'Navigation'}>
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink to={t.to} end={t.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${isActive ? 'text-[#a78bfa]' : 'text-white/55 hover:text-white'}`}>
              {({ isActive }) => <><span className={`text-xl transition ${isActive ? 'scale-110' : 'grayscale-[.6]'}`} aria-hidden="true">{t.icon}</span>{t.label}
                {isActive && <span className="mt-0.5 h-1 w-1 rounded-full bg-[#a78bfa]" aria-hidden="true" />}</>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

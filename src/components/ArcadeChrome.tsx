import { useEffect, useState } from 'react'
import { BottomNav } from './fz/MainNavigation'
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
  return <span className="relative inline-grid place-items-center rounded-full p-[3px]" style={{ background: 'conic-gradient(from 210deg, #E5B85C, #F5F5FA, #20D5D2, #6D4AFF, #E5B85C)' }}><span className="rounded-full bg-fz-navy p-[3px]"><Avatar avatar={avatar} size={size} /></span></span>
}

/** Kept for existing screens: the shared Friends Zone bottom navigation. */
export function TabBar() { return <BottomNav /> }

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { loadState, type BakasaState } from './api'

/** Built-in party avatars: emoji on a colored disc, so there is never a broken image. */
export const AVATARS: Record<string, { emoji: string; color: string }> = {
  fox: { emoji: '🦊', color: '#ff8a3d' }, cat: { emoji: '🐱', color: '#ffd23d' }, owl: { emoji: '🦉', color: '#b98bff' },
  lion: { emoji: '🦁', color: '#f5b83d' }, panda: { emoji: '🐼', color: '#9fe3ff' }, frog: { emoji: '🐸', color: '#7bd96a' },
  bear: { emoji: '🐻', color: '#d49a6a' }, tiger: { emoji: '🐯', color: '#ff9f43' }, koala: { emoji: '🐨', color: '#c9d1dc' },
  monkey: { emoji: '🐵', color: '#e0a96d' }, penguin: { emoji: '🐧', color: '#6fb7ff' }, unicorn: { emoji: '🦄', color: '#ff8fd0' }
}
export const AVATAR_KEYS = Object.keys(AVATARS)
export const randomAvatar = () => AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)]

export function Avatar({ avatar, size = 56, ring, dim, badge }: { avatar: string; size?: number; ring?: string; dim?: boolean; badge?: ReactNode }) {
  const a = AVATARS[avatar] ?? AVATARS.fox
  return (
    <span className={`relative inline-grid shrink-0 place-items-center rounded-full ${dim ? 'opacity-40 grayscale' : ''}`}
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 55%), ${a.color}`,
        boxShadow: ring ? `0 0 0 3px ${ring}, 0 6px 18px rgba(0,0,0,.35)` : '0 6px 18px rgba(0,0,0,.35)', fontSize: size * 0.55 }} aria-hidden="true">
      {a.emoji}
      {badge && <span className="absolute -top-1 -end-1 text-base leading-none">{badge}</span>}
    </span>
  )
}

export function AvatarPicker({ value, onChange }: { value: string; onChange: (a: string) => void }) {
  const { lang } = useI18n()
  return (
    <div role="radiogroup" aria-label={lang === 'ar' ? 'اختار شخصيتك' : 'Choose your avatar'} className="grid grid-cols-6 gap-2">
      {AVATAR_KEYS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={k} onClick={() => onChange(k)}
          className={`grid place-items-center rounded-2xl p-1 transition ${value === k ? 'bg-bk-accent/25 ring-2 ring-bk-accent' : 'hover:bg-white/5'}`}>
          <Avatar avatar={k} size={42} />
        </button>
      ))}
    </div>
  )
}

/** Seconds left until an ISO deadline, corrected by the server clock offset. */
export function useCountdown(deadline: string | null | undefined, offsetMs: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [deadline])
  if (!deadline) return null
  return Math.max(0, Math.ceil((Date.parse(deadline) - (now + offsetMs)) / 1000))
}

export function TimerRing({ seconds, total, label }: { seconds: number | null; total: number; label: string }) {
  if (seconds === null) return null
  const pct = total > 0 ? Math.min(1, seconds / total) : 0
  const warn = seconds <= 10
  return (
    <div className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full ${warn ? 'bk-pulse' : ''}`} role="timer" aria-label={`${label}: ${seconds}`}
      style={{ background: `conic-gradient(${warn ? '#ff5d5d' : '#ffb938'} ${pct * 360}deg, rgba(255,255,255,.12) 0deg)` }}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-bk-900 font-display text-xl" dir="ltr">{seconds}</span>
    </div>
  )
}

/** Short synthesized sounds; respects a per-device mute toggle. */
const SOUND_KEY = 'bakasaSound'
export function soundOn(): boolean { try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true } }
export function setSoundOn(on: boolean) { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off') } catch { /* ignore */ } }
export function playSound(kind: 'join' | 'reveal' | 'tick' | 'turn' | 'vote' | 'win' | 'lose') {
  if (!soundOn()) return
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const notes: Record<string, number[]> = { join: [660, 880], reveal: [220, 330, 440, 660], tick: [880], turn: [523, 659], vote: [440, 554], win: [523, 659, 784, 1046], lose: [392, 330, 262] }
    notes[kind].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = kind === 'reveal' ? 'triangle' : 'sine'; o.frequency.value = f
      const t = ctx.currentTime + i * 0.12
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2)
    })
    window.setTimeout(() => void ctx.close(), 1500)
  } catch { /* audio unavailable */ }
}

export function SoundToggle() {
  const { lang } = useI18n()
  const [on, setOn] = useState(soundOn)
  return <button type="button" className="bk-icon-btn" aria-pressed={on} aria-label={lang === 'ar' ? 'الصوت' : 'Sound'}
    onClick={() => { setSoundOn(!on); setOn(!on) }}>{on ? '🔊' : '🔇'}</button>
}

/** Live room state: realtime row changes + a 4 s poll as a safety net. Tracks connection health. */
export function useBakasaRoom(roomId: string | undefined) {
  const [state, setState] = useState<BakasaState | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [online, setOnline] = useState(true)
  const [offset, setOffset] = useState(0)
  const busy = useRef(false)
  const reload = useCallback(async () => {
    if (!roomId || busy.current) return
    busy.current = true
    const sent = Date.now()
    try {
      const s = await loadState(roomId)
      const rtt = Date.now() - sent
      setOffset(Date.parse(s.server_now) - (sent + rtt / 2))
      setState(s); setError(null); setOnline(true)
    } catch (e) { setError(e); setOnline(false) } finally { busy.current = false }
  }, [roomId])
  useEffect(() => {
    if (!roomId) return
    void reload()
    const ch = supabase.channel(`bakasa-${roomId}`)
    for (const [table, filter] of [['bakasa_rooms', `id=eq.${roomId}`], ['bakasa_players', `room_id=eq.${roomId}`], ['bakasa_messages', `room_id=eq.${roomId}`]] as const)
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => { void reload() })
    ch.subscribe()
    const poll = window.setInterval(() => { void reload() }, 4000)
    const onFocus = () => { void reload() }
    window.addEventListener('online', onFocus); window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(poll); window.removeEventListener('online', onFocus); window.removeEventListener('focus', onFocus); void supabase.removeChannel(ch) }
  }, [roomId, reload])
  return { state, error, online, offset, reload }
}

export function ConfirmDialog({ open, title, body, confirm, onConfirm, onClose }: { open: boolean; title: string; body: string; confirm: string; onConfirm: () => void; onClose: () => void }) {
  const { lang } = useI18n()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="bk-dialog-title">
      <div className="bk-panel bk-pop w-full max-w-sm space-y-4 text-center">
        <h2 id="bk-dialog-title" className="font-display text-2xl">{title}</h2>
        <p className="text-sm opacity-80">{body}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="bk-btn-ghost" onClick={onClose} autoFocus>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button type="button" className="bk-btn-danger" onClick={() => { onConfirm(); onClose() }}>{confirm}</button>
        </div>
      </div>
    </div>
  )
}

export function BakasaLogo({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={small ? 'h-14 w-14' : 'h-28 w-28'} aria-hidden="true">
      <defs><radialGradient id="bk-glow"><stop offset="0" stopColor="#ffb938" stopOpacity=".6" /><stop offset="1" stopColor="#ffb938" stopOpacity="0" /></radialGradient></defs>
      <circle cx="60" cy="60" r="58" fill="url(#bk-glow)" />
      <ellipse cx="60" cy="92" rx="46" ry="12" fill="#2a1d5c" />
      {[[22, 70, '#ff8a3d'], [42, 62, '#7bd96a'], [78, 62, '#3dc5ff'], [98, 70, '#ff6fa8']].map(([x, y, c], i) => (
        <g key={i}><circle cx={x as number} cy={(y as number) - 16} r="9" fill={c as string} /><path d={`M${(x as number) - 12} ${(y as number) + 10} q12 -24 24 0z`} fill={c as string} /></g>
      ))}
      <g><circle cx="60" cy="40" r="13" fill="#1b1340" stroke="#ffb938" strokeWidth="3" /><path d="M43 74 q17 -34 34 0z" fill="#1b1340" stroke="#ffb938" strokeWidth="3" />
        <text x="60" y="46" textAnchor="middle" fontSize="18" fontWeight="700" fill="#ffb938">?</text></g>
    </svg>
  )
}

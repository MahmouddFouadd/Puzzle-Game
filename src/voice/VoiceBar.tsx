import { useEffect, useRef } from 'react'
import { useI18n } from '../lib/i18n'
import type { VoiceRoomKind } from './supabaseSignaling'
import { useVoiceChat } from './useVoiceChat'

/** Plays one peer's audio. WebRTC audio only plays when attached to a media element. */
function PeerAudio({ stream }: { stream: MediaStream | null }) {
  const el = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const a = el.current
    if (!a) return
    if (a.srcObject !== stream) a.srcObject = stream
    if (stream) void a.play().catch(() => undefined)
  }, [stream])
  return <audio ref={el} autoPlay playsInline className="hidden" />
}

const initials = (s: string) => s.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '؟'

/**
 * Compact online voice bar for a room. Joining is optional, the microphone is OFF until the player turns it on,
 * and nothing is recorded: audio goes directly between players' devices.
 */
export function VoiceBar({ kind, roomId, selfId, names, className = '' }: { kind: VoiceRoomKind; roomId: string | undefined; selfId: string | undefined; names: Map<string, string> | Record<string, string>; className?: string }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const v = useVoiceChat(kind, roomId, selfId)
  const nameOf = (id: string) => (names instanceof Map ? names.get(id) : names[id]) ?? (ar ? 'لاعب' : 'Player')
  const T = (a: string, e: string) => (ar ? a : e)

  if (!roomId || !selfId) return null
  const box = `rounded-2xl border border-white/15 bg-[#0b1220]/90 p-2.5 text-sm text-white shadow-lg backdrop-blur ${className}`
  const btn = 'rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50'

  if (!v.supported) return <div className={box} role="status">🔇 {T('المحادثة الصوتية مش مدعومة في المتصفح ده.', 'Voice chat is not supported in this browser.')}</div>

  if (!v.joined) return (
    <div className={`${box} flex flex-wrap items-center justify-between gap-2`}>
      <span className="text-xs opacity-80">🎧 {T('دردشة صوتية مع اللاعبين – المايك بيفضل مقفول لحد ما تفتحه.', 'Voice chat with the players – your mic stays off until you turn it on.')}</span>
      <button type="button" className={`${btn} bg-[#2dd4bf] text-[#062421]`} disabled={v.joining} onClick={() => void v.join()}>{v.joining ? '…' : T('🎧 انضم للصوت', '🎧 Join voice')}</button>
      {v.error && <p className="w-full text-xs text-[#ff8a8d]" role="alert">{T('مقدرناش نوصل للمحادثة الصوتية. جرّب تاني.', 'Could not connect to voice chat. Try again.')}</p>}
    </div>
  )

  const micOn = v.mic === 'on'
  const people = [{ id: 'self', label: T('أنت', 'You'), on: micOn, talking: v.transmitting, conn: 'connected' },
    ...v.peers.map((p) => ({ id: p.id, label: nameOf(p.id), on: p.micOn, talking: p.transmitting, conn: p.connection }))]
  const micMsg: Record<string, string> = {
    denied: T('المتصفح رفض الوصول للمايك. اسمح بيه من إعدادات المتصفح أو التطبيق.', 'Microphone access was blocked. Allow it in your browser or app settings.'),
    unavailable: T('مفيش مايك متاح على الجهاز ده.', 'No microphone is available on this device.'),
    error: T('حصلت مشكلة في تشغيل المايك.', 'Could not start the microphone.')
  }

  return (
    <div className={`${box} space-y-2`} onPointerDown={() => v.resumeAudio()}>
      {v.peers.map((p) => <PeerAudio key={p.id} stream={p.stream} />)}
      <ul className="flex flex-wrap gap-1.5" aria-label={T('في المحادثة الصوتية', 'In voice chat')}>
        {people.map((p) => {
          const lvl = p.talking ? (v.levels[p.id] ?? 0) : 0
          const speaking = lvl > 0.08
          return (
            <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-white/10 py-0.5 pe-2.5 ps-0.5" title={p.conn !== 'connected' ? p.conn : undefined}>
              <span className={`grid h-7 w-7 place-items-center rounded-full bg-[#1e2d45] text-[11px] font-black transition-shadow ${speaking ? 'ring-2 ring-[#2dd4bf]' : ''}`}
                style={speaking ? { boxShadow: `0 0 ${6 + lvl * 16}px rgba(45,212,191,.8)` } : undefined}>{p.id === 'self' ? '🙂' : initials(p.label)}</span>
              <span className="max-w-[7rem] truncate text-xs">{p.label}</span>
              <span className="text-xs" aria-label={p.on ? T('المايك مفتوح', 'Mic on') : T('المايك مقفول', 'Mic off')}>{p.conn === 'failed' ? '⚠️' : p.conn !== 'connected' && p.id !== 'self' ? '…' : p.on ? (p.talking ? '🎙️' : '🤫') : '🔇'}</span>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        {micOn
          ? <button type="button" className={`${btn} bg-[#e5484d]`} onClick={() => v.disableMic()}>🔇 {T('اقفل المايك', 'Mic off')}</button>
          : <button type="button" className={`${btn} bg-[#2dd4bf] text-[#062421]`} disabled={v.mic === 'requesting'} onClick={() => void v.enableMic()}>{v.mic === 'requesting' ? '…' : `🎙️ ${T('افتح المايك', 'Turn mic on')}`}</button>}
        <div className="inline-flex overflow-hidden rounded-full border border-white/20 text-xs" role="radiogroup" aria-label={T('طريقة الكلام', 'Talk mode')}>
          {(['open', 'ptt'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={v.mode === m} onClick={() => v.setMode(m)}
              className={`px-2.5 py-1.5 font-bold ${v.mode === m ? 'bg-white text-[#0b1220]' : ''}`}>{m === 'open' ? T('مايك مفتوح', 'Open mic') : T('اضغط واتكلم', 'Push to talk')}</button>
          ))}
        </div>
        {micOn && v.mode === 'ptt' && (
          <button type="button" aria-pressed={v.pttDown}
            className={`${btn} touch-none select-none ${v.pttDown ? 'bg-[#f5a623] text-[#1a1203] scale-105' : 'bg-white/15'}`}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); v.setPtt(true) }}
            onPointerUp={() => v.setPtt(false)} onPointerCancel={() => v.setPtt(false)} onLostPointerCapture={() => v.setPtt(false)}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); v.setPtt(true) } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') v.setPtt(false) }}
            onContextMenu={(e) => e.preventDefault()}>{v.pttDown ? T('🎙️ بتتكلم…', '🎙️ Talking…') : T('✋ اضغط مع الاستمرار للكلام', '✋ Hold to talk')}</button>
        )}
        <button type="button" className={`${btn} ms-auto bg-white/10`} onClick={() => void v.leave()}>✕ {T('اخرج من الصوت', 'Leave voice')}</button>
      </div>
      {micMsg[v.mic] && <p className="text-xs text-[#ff8a8d]" role="alert">{micMsg[v.mic]}</p>}
      {v.peers.length === 0 && <p className="text-xs opacity-70" role="status">{T('مستنيين باقي اللاعبين ينضموا للصوت…', 'Waiting for other players to join voice…')}</p>}
      {v.peers.some((p) => p.connection === 'failed') && <p className="text-xs text-[#f5c46b]" role="status">{T('فيه لاعب مش قادرين نوصله صوتيًا (غالبًا بسبب الشبكة).', 'Could not reach a player by voice (usually a network restriction).')}</p>}
    </div>
  )
}

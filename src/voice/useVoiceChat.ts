import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { VoiceChat } from './VoiceChat'
import { iceServers } from './iceServers'
import { SupabaseSignalingAdapter, voiceTopic, type VoiceRoomKind } from './supabaseSignaling'
import type { MicState, PeerConnectionLike, VoiceMode, VoiceSnapshot } from './types'

const IDLE: VoiceSnapshot = { joined: false, joining: false, error: null, mic: 'off', mode: 'open', pttDown: false, transmitting: false, peers: [] }

export const voiceSupported = () =>
  typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function' && !!navigator.mediaDevices?.getUserMedia

/** Speaking meter: RMS of each live stream, sampled ~7 times a second. Nothing is stored or sent anywhere. */
function useLevels(streams: Array<[string, MediaStream | null]>, ctx: AudioContext | null) {
  const [levels, setLevels] = useState<Record<string, number>>({})
  const nodes = useRef(new Map<string, { stream: MediaStream; src: MediaStreamAudioSourceNode; an: AnalyserNode }>())
  const key = streams.map(([id, s]) => `${id}:${s?.id ?? ''}`).join('|')
  useEffect(() => {
    if (!ctx) return
    const want = new Map(streams.filter(([, s]) => s && s.getAudioTracks().length).map(([id, s]) => [id, s!]))
    for (const [id, n] of nodes.current) if (want.get(id) !== n.stream) { n.src.disconnect(); nodes.current.delete(id) }
    for (const [id, s] of want) if (!nodes.current.has(id)) {
      try { const src = ctx.createMediaStreamSource(s); const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); nodes.current.set(id, { stream: s, src, an }) } catch { /* stream not ready yet */ }
    }
  }, [key, ctx]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ctx) return
    const buf = new Uint8Array(512)
    const t = window.setInterval(() => {
      const next: Record<string, number> = {}
      for (const [id, n] of nodes.current) {
        n.an.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        next[id] = Math.min(1, Math.sqrt(sum / buf.length) * 4)
      }
      setLevels(next)
    }, 140)
    return () => { window.clearInterval(t); for (const n of nodes.current.values()) n.src.disconnect(); nodes.current.clear() }
  }, [ctx])
  return levels
}

/** Online voice for one room. Nothing connects until join(); the mic stays off until enableMic(). */
export function useVoiceChat(kind: VoiceRoomKind, roomId: string | undefined, selfId: string | undefined) {
  const [snap, setSnap] = useState<VoiceSnapshot>(IDLE)
  const [ctx, setCtx] = useState<AudioContext | null>(null)
  const vc = useRef<VoiceChat | null>(null)

  const leave = useCallback(async () => {
    const v = vc.current
    vc.current = null
    await v?.leave()
    setSnap(IDLE)
    setCtx((c) => { void c?.close().catch(() => undefined); return null })
  }, [])

  const join = useCallback(async () => {
    if (!roomId || !selfId || vc.current || !voiceSupported()) return
    // Created inside the click handler, so audio playback is allowed on mobile browsers.
    try { const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; setCtx(new AC()) } catch { /* meters off */ }
    const v = new VoiceChat({
      selfId,
      signaling: new SupabaseSignalingAdapter(supabase, voiceTopic(kind, roomId)),
      createPeer: (config) => new RTCPeerConnection(config) as unknown as PeerConnectionLike,
      getMicrophone: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      iceServers: iceServers(),
      onChange: (s) => { if (vc.current === v) setSnap(s) }
    })
    vc.current = v
    try { await v.join() } catch { if (vc.current === v) { vc.current = null; setSnap({ ...IDLE, error: v.state.error ?? 'connect_failed' }) } }
  }, [kind, roomId, selfId])

  // Leave when the room changes, the screen closes or the tab goes away.
  useEffect(() => {
    const bye = () => { void vc.current?.leave() }
    window.addEventListener('pagehide', bye)
    return () => { window.removeEventListener('pagehide', bye); void leave() }
  }, [kind, roomId, selfId, leave])

  const levels = useLevels([['self', vc.current?.localStream ?? null], ...snap.peers.map((p) => [p.id, p.stream] as [string, MediaStream | null])], ctx)

  return {
    ...snap,
    levels,
    supported: voiceSupported(),
    join,
    leave,
    enableMic: (): Promise<MicState> => { void ctx?.resume().catch(() => undefined); return vc.current?.enableMic() ?? Promise.resolve('off') },
    disableMic: () => vc.current?.disableMic(),
    setMode: (m: VoiceMode) => vc.current?.setMode(m),
    setPtt: (down: boolean) => vc.current?.setPtt(down),
    resumeAudio: () => { void ctx?.resume().catch(() => undefined) }
  }
}

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { SignalMessage, SignalingAdapter, SignalingHandlers } from './types'

export type VoiceRoomKind = 'room' | 'bakasa' | 'detective'
export const voiceTopic = (kind: VoiceRoomKind, id: string) => `voice:${kind}:${id}`

/**
 * Signaling over a PRIVATE Supabase Realtime channel. Only SDP/ICE and small state messages pass through it;
 * audio goes peer to peer. Access is limited by RLS on realtime.messages (migration 0028) to members of the room.
 * Presence (keyed by user id) tells everyone who is in the voice channel.
 */
export class SupabaseSignalingAdapter implements SignalingAdapter {
  private ch: RealtimeChannel | null = null
  constructor(private supabase: SupabaseClient, private topic: string) {}

  async connect(selfId: string, h: SignalingHandlers): Promise<void> {
    await this.supabase.realtime.setAuth()
    const ch = this.supabase.channel(this.topic, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: selfId } } })
    this.ch = ch
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => {
      const m = payload as SignalMessage
      if (!m || typeof m !== 'object' || typeof m.from !== 'string' || m.from === selfId) return
      if ('to' in m && m.to && m.to !== selfId) return
      h.onMessage(m)
    })
    ch.on('presence', { event: 'sync' }, () => h.onPeers(Object.keys(ch.presenceState()).filter((id) => id !== selfId)))
    await new Promise<void>((resolve, reject) => {
      let settled = false
      ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          void ch.track({ at: Date.now() })
          if (!settled) { settled = true; resolve() }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const reason = err?.message ?? status
          if (!settled) { settled = true; reject(new Error(reason)) } else h.onError?.(reason)
        }
      })
    })
  }

  send(m: SignalMessage): void { void this.ch?.send({ type: 'broadcast', event: 'signal', payload: m }) }

  async disconnect(): Promise<void> {
    const ch = this.ch
    this.ch = null
    if (!ch) return
    await ch.untrack().catch(() => undefined)
    await this.supabase.removeChannel(ch).catch(() => undefined)
  }
}

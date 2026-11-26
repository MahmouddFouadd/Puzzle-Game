import { describe, expect, it, vi } from 'vitest'
import { VoiceChat } from './VoiceChat'
import type { PeerConnectionLike, SignalMessage, SignalingAdapter, SignalingHandlers, TransceiverLike } from './types'

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)) }

/** In-memory signaling bus: presence + addressed/broadcast messages, delivered asynchronously. */
class Bus {
  members = new Map<string, SignalingHandlers>()
  log: SignalMessage[] = []
  adapter(): SignalingAdapter & { selfId?: string } {
    const bus = this
    const a: SignalingAdapter & { selfId?: string } = {
      async connect(id, h) { a.selfId = id; bus.members.set(id, h); bus.presence() },
      send(m) { bus.log.push(m); for (const [id, h] of bus.members) if (id !== m.from && (!('to' in m) || !m.to || m.to === id)) setTimeout(() => h.onMessage(structuredClone(m)), 0) },
      async disconnect() { if (a.selfId) bus.members.delete(a.selfId); bus.presence() }
    }
    return a
  }
  presence() { for (const [id, h] of this.members) { const others = [...this.members.keys()].filter((x) => x !== id); setTimeout(() => h.onPeers(others), 0) } }
}

/** Minimal RTCPeerConnection model: offer/answer state machine, implicit rollback, transceivers, ICE. */
class FakePC implements PeerConnectionLike {
  static all: FakePC[] = []
  connectionState = 'new'
  signalingState = 'stable'
  localDescription: { type: string; sdp?: string } | null = null
  remoteDescription: { type: string; sdp?: string } | null = null
  onicecandidate: PeerConnectionLike['onicecandidate'] = null
  ontrack: PeerConnectionLike['ontrack'] = null
  onnegotiationneeded: (() => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  transceivers: Array<TransceiverLike & { sender: { track: MediaStreamTrack | null; replaceTrack(t: MediaStreamTrack | null): Promise<void> } }> = []
  ice: RTCIceCandidateInit[] = []
  closed = false
  rolledBack = 0
  id = Math.random().toString(36).slice(2, 7)
  constructor() { FakePC.all.push(this) }
  private tx(direction: string) {
    const t = { direction, sender: { track: null as MediaStreamTrack | null, async replaceTrack(tr: MediaStreamTrack | null) { t.sender.track = tr } }, receiver: { track: { kind: 'audio' } } }
    this.transceivers.push(t); return t
  }
  addTransceiver(_k: 'audio', init: { direction: RTCRtpTransceiverDirection }) { const t = this.tx(init.direction); setTimeout(() => this.onnegotiationneeded?.(), 0); return t }
  getTransceivers() { return this.transceivers }
  async setLocalDescription() {
    if (this.signalingState === 'have-remote-offer') { this.localDescription = { type: 'answer', sdp: `answer-${this.id}` }; this.signalingState = 'stable'; this.connect() }
    else { this.localDescription = { type: 'offer', sdp: `offer-${this.id}` }; this.signalingState = 'have-local-offer' }
    setTimeout(() => this.onicecandidate?.({ candidate: { candidate: `cand-${this.id}`, sdpMid: '0', sdpMLineIndex: 0 } }), 0)
  }
  async setRemoteDescription(d: { type: string; sdp?: string }) {
    if (d.type === 'offer') {
      if (this.signalingState === 'have-local-offer') { this.rolledBack++; this.signalingState = 'stable' }
      this.remoteDescription = d; this.signalingState = 'have-remote-offer'
      if (!this.transceivers.length) this.tx('recvonly')
      this.ontrack?.({ track: { kind: 'audio' }, streams: [{ id: `stream-from-${d.sdp}` } as unknown as MediaStream] })
    } else if (d.type === 'answer') {
      if (this.signalingState !== 'have-local-offer') throw new Error('InvalidStateError')
      this.remoteDescription = d; this.signalingState = 'stable'
      this.ontrack?.({ track: { kind: 'audio' }, streams: [{ id: `stream-from-${d.sdp}` } as unknown as MediaStream] })
      this.connect()
    }
  }
  async addIceCandidate(c: RTCIceCandidateInit) { if (!this.remoteDescription) throw new Error('no remote description'); this.ice.push(c) }
  restartIce() { setTimeout(() => this.onnegotiationneeded?.(), 0) }
  close() { this.closed = true; this.connectionState = 'closed' }
  private connect() { this.connectionState = 'connected'; this.onconnectionstatechange?.() }
}

function fakeTrack() {
  const t = { kind: 'audio', enabled: true, stopped: false, onended: null as null | (() => void), stop() { t.stopped = true } }
  return t as unknown as MediaStreamTrack & { stopped: boolean }
}
function micOk() {
  const track = fakeTrack()
  const getMicrophone = vi.fn(async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }) as unknown as MediaStream)
  return { track, getMicrophone }
}
function make(bus: Bus, id: string, getMicrophone = micOk().getMicrophone) {
  return new VoiceChat({ selfId: id, signaling: bus.adapter(), createPeer: () => new FakePC(), getMicrophone })
}

describe('VoiceChat core', () => {
  it('joins with the microphone OFF and never asks for it', async () => {
    const bus = new Bus(); const m = micOk()
    const a = make(bus, 'a', m.getMicrophone), b = make(bus, 'b')
    await a.join(); await b.join(); await flush()
    expect(a.state.mic).toBe('off'); expect(a.state.transmitting).toBe(false)
    expect(m.getMicrophone).not.toHaveBeenCalled()
    expect(a.state.peers.map((p) => [p.id, p.connection])).toEqual([['b', 'connected']])
    expect(b.state.peers.map((p) => [p.id, p.connection])).toEqual([['a', 'connected']])
    // one transceiver per pair: added by the smaller id, answered sendrecv by the other
    const pcs = FakePC.all.slice(-2)
    expect(pcs.every((pc) => pc.transceivers.length === 1 && pc.transceivers[0].direction === 'sendrecv')).toBe(true)
    expect(pcs.every((pc) => pc.transceivers[0].sender.track === null)).toBe(true)
  })

  it('opt-in enables the mic and sends it to every peer without renegotiating; open mic transmits', async () => {
    const bus = new Bus(); const m = micOk()
    const a = make(bus, 'a', m.getMicrophone), b = make(bus, 'b'), c = make(bus, 'c')
    await a.join(); await b.join(); await c.join(); await flush()
    const offersBefore = bus.log.filter((x) => x.type === 'description').length
    expect(await a.enableMic()).toBe('on'); await flush()
    expect(m.getMicrophone).toHaveBeenCalledTimes(1)
    expect(a.state.transmitting).toBe(true); expect(m.track.enabled).toBe(true)
    expect(bus.log.filter((x) => x.type === 'description').length).toBe(offersBefore)
    expect(b.state.peers.find((p) => p.id === 'a')).toMatchObject({ micOn: true, transmitting: true })
    expect(a.state.peers).toHaveLength(2)
  })

  it('push-to-talk only transmits while the button is held', async () => {
    const bus = new Bus(); const m = micOk()
    const a = make(bus, 'a', m.getMicrophone), b = make(bus, 'b')
    await a.join(); await b.join(); await flush(); await a.enableMic()
    a.setMode('ptt'); await flush()
    expect(m.track.enabled).toBe(false); expect(a.state.transmitting).toBe(false)
    expect(b.state.peers[0]).toMatchObject({ micOn: true, transmitting: false })
    a.setPtt(true); await flush()
    expect(m.track.enabled).toBe(true); expect(b.state.peers[0].transmitting).toBe(true)
    a.setPtt(false); await flush()
    expect(m.track.enabled).toBe(false); expect(b.state.peers[0].transmitting).toBe(false)
  })

  it('turning the mic off releases the device', async () => {
    const bus = new Bus(); const m = micOk()
    const a = make(bus, 'a', m.getMicrophone), b = make(bus, 'b')
    await a.join(); await b.join(); await flush(); await a.enableMic(); await flush()
    a.disableMic(); await flush()
    expect(m.track.stopped).toBe(true); expect(a.state.mic).toBe('off'); expect(a.state.transmitting).toBe(false)
    expect(FakePC.all.slice(-2).every((pc) => pc.transceivers[0].sender.track === null)).toBe(true)
  })

  it('reports a denied or missing microphone without sending anything', async () => {
    const bus = new Bus()
    const denied = make(bus, 'a', vi.fn(async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }) }))
    const none = make(bus, 'b', vi.fn(async () => { throw Object.assign(new Error('no'), { name: 'NotFoundError' }) }))
    await denied.join(); await none.join(); await flush()
    expect(await denied.enableMic()).toBe('denied'); expect(await none.enableMic()).toBe('unavailable')
    expect(denied.state.transmitting).toBe(false)
  })

  it('leaving closes every connection, stops the mic and removes us from the others', async () => {
    const bus = new Bus(); const m = micOk()
    const a = make(bus, 'a', m.getMicrophone), b = make(bus, 'b'), c = make(bus, 'c')
    await a.join(); await b.join(); await c.join(); await flush(); await a.enableMic(); await flush()
    const before = FakePC.all.length
    await a.leave(); await flush()
    expect(m.track.stopped).toBe(true); expect(a.state.joined).toBe(false)
    expect(b.state.peers.map((p) => p.id)).toEqual(['c']); expect(c.state.peers.map((p) => p.id)).toEqual(['b'])
    expect(FakePC.all.length).toBe(before)
  })

  it('handles an offer collision: the impolite side ignores, the polite side rolls back, one stable connection', async () => {
    const bus = new Bus()
    const a = make(bus, 'a'), b = make(bus, 'b')
    await a.join(); await b.join(); await flush()
    const [pa, pb] = FakePC.all.slice(-2)
    // both sides decide to renegotiate at the same moment (e.g. an ICE restart)
    pa.onnegotiationneeded?.(); pb.onnegotiationneeded?.(); await flush()
    expect(pa.signalingState).toBe('stable'); expect(pb.signalingState).toBe('stable')
    expect(pa.rolledBack + pb.rolledBack).toBe(1)
    // 'b' > 'a', so b is the polite peer and is the one that rolled back
    const polite = pa.localDescription?.type === 'answer' ? pa : pb
    expect(polite.rolledBack).toBe(1)
    expect(a.state.peers[0].connection).toBe('connected'); expect(b.state.peers[0].connection).toBe('connected')
  })

  it('ignores signals addressed to someone else and queues ICE that arrives early', async () => {
    const bus = new Bus()
    const a = make(bus, 'a'), b = make(bus, 'b')
    await a.join(); await b.join(); await flush()
    const handlers = bus.members.get('b')!
    const peersBefore = b.state.peers.length
    handlers.onMessage({ type: 'state', from: 'z', to: 'c', micOn: true, transmitting: true })
    await flush()
    expect(b.state.peers.length).toBe(peersBefore)
    expect(FakePC.all.slice(-2).every((pc) => pc.ice.length >= 1)).toBe(true)
  })
})

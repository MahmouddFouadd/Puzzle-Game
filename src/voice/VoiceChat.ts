import type { MicState, PeerConnectionLike, PeerInfo, SignalMessage, SignalingAdapter, TransceiverLike, VoiceMode, VoiceSnapshot } from './types'

export interface VoiceChatOptions {
  selfId: string
  signaling: SignalingAdapter
  createPeer: (config: RTCConfiguration) => PeerConnectionLike
  /** Asks the browser for the microphone. Only called from enableMic(), i.e. after an explicit user action. */
  getMicrophone: () => Promise<MediaStream>
  iceServers?: RTCIceServer[]
  onChange?: (s: VoiceSnapshot) => void
}

type Peer = {
  id: string
  pc: PeerConnectionLike
  polite: boolean
  initiator: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  sender: TransceiverLike['sender'] | null
  pendingIce: RTCIceCandidateInit[]
  stream: MediaStream | null
  micOn: boolean
  transmitting: boolean
}

/**
 * Full-mesh WebRTC audio between everyone in one room. Transport-agnostic: signaling goes through a
 * SignalingAdapter, peer connections come from createPeer().
 *
 * - The microphone is OFF until enableMic() is called (that is the only place getMicrophone runs).
 * - Each pair has one audio transceiver, added by the participant with the smaller id; the other side
 *   answers with sendrecv. Turning the mic on/off or push-to-talk never renegotiates: tracks are swapped
 *   with replaceTrack and gated with track.enabled.
 * - "Perfect negotiation": the participant with the larger id is polite and yields on offer collisions.
 * - Nothing is recorded or stored; media flows peer to peer.
 */
export class VoiceChat {
  private peers = new Map<string, Peer>()
  private track: MediaStreamTrack | null = null
  private stream: MediaStream | null = null
  private snap: VoiceSnapshot = { joined: false, joining: false, error: null, mic: 'off', mode: 'open', pttDown: false, transmitting: false, peers: [] }
  private closed = false

  constructor(private o: VoiceChatOptions) {}

  get state(): VoiceSnapshot { return this.snap }

  async join(): Promise<void> {
    if (this.snap.joined || this.snap.joining) return
    this.closed = false
    this.set({ joining: true, error: null })
    try {
      await this.o.signaling.connect(this.o.selfId, {
        onMessage: (m) => { void this.handle(m) },
        onPeers: (ids) => this.syncPeers(ids),
        onError: (reason) => this.set({ error: reason })
      })
      this.set({ joined: true, joining: false })
      this.announce()
    } catch (e) {
      this.set({ joining: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }

  async leave(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try { if (this.snap.joined) this.o.signaling.send({ type: 'bye', from: this.o.selfId }) } catch { /* channel already gone */ }
    for (const id of [...this.peers.keys()]) this.dropPeer(id)
    this.releaseMic()
    await this.o.signaling.disconnect().catch(() => undefined)
    this.set({ joined: false, joining: false, mic: 'off', pttDown: false })
  }

  /** Explicit opt-in: the only path that touches the microphone. */
  async enableMic(): Promise<MicState> {
    if (this.snap.mic === 'on' || this.snap.mic === 'requesting') return this.snap.mic
    this.set({ mic: 'requesting' })
    let stream: MediaStream
    try { stream = await this.o.getMicrophone() } catch (e) {
      const name = (e as { name?: string })?.name ?? ''
      const mic: MicState = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError' ? 'unavailable' : 'error'
      this.set({ mic }); return mic
    }
    const track = stream.getAudioTracks()[0]
    if (!track) { stream.getTracks().forEach((t) => t.stop()); this.set({ mic: 'unavailable' }); return 'unavailable' }
    if (this.closed) { track.stop(); return 'off' }
    this.stream = stream; this.track = track
    track.onended = () => { if (this.track === track) this.disableMic() }
    this.set({ mic: 'on' })
    this.applyGate()
    await Promise.all([...this.peers.values()].map((p) => p.sender?.replaceTrack(track).catch(() => undefined)))
    return 'on'
  }

  /** Turns the microphone fully off (releases the device, so the OS indicator goes away). */
  disableMic(): void {
    this.releaseMic()
    this.set({ mic: 'off' })
    this.applyGate()
  }

  setMode(mode: VoiceMode): void { this.set({ mode, pttDown: false }); this.applyGate() }
  setPtt(down: boolean): void { if (this.snap.pttDown === down) return; this.set({ pttDown: down }); this.applyGate() }

  /** Local microphone stream (for the speaking meter); null while the mic is off. */
  get localStream(): MediaStream | null { return this.stream }

  // ---------- internals ----------
  private releaseMic() {
    for (const p of this.peers.values()) void p.sender?.replaceTrack(null).catch(() => undefined)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null; this.track = null
  }

  private applyGate() {
    const transmitting = this.snap.mic === 'on' && !!this.track && (this.snap.mode === 'open' || this.snap.pttDown)
    if (this.track) this.track.enabled = transmitting
    if (transmitting !== this.snap.transmitting) this.set({ transmitting })
    this.announce()
  }

  private announce() {
    if (!this.snap.joined || this.closed) return
    try { this.o.signaling.send({ type: 'state', from: this.o.selfId, transmitting: this.snap.transmitting, micOn: this.snap.mic === 'on' }) } catch { /* ignore */ }
  }

  private syncPeers(ids: string[]) {
    if (this.closed) return
    const want = new Set(ids.filter((id) => id && id !== this.o.selfId))
    for (const id of want) this.ensurePeer(id)
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.dropPeer(id)
    this.emitPeers()
    this.announce()
  }

  private ensurePeer(id: string): Peer {
    const existing = this.peers.get(id)
    if (existing) return existing
    const pc = this.o.createPeer({ iceServers: this.o.iceServers ?? [] })
    const p: Peer = { id, pc, polite: this.o.selfId > id, initiator: this.o.selfId < id, makingOffer: false, ignoreOffer: false, sender: null, pendingIce: [], stream: null, micOn: false, transmitting: false }
    this.peers.set(id, p)
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const c = typeof e.candidate.toJSON === 'function' ? e.candidate.toJSON() : { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }
      this.o.signaling.send({ type: 'ice', from: this.o.selfId, to: id, candidate: c })
    }
    // A transceiver added without a stream delivers a bare track: wrap it so it can be played.
    pc.ontrack = (e) => {
      p.stream = e.streams[0] ?? (typeof MediaStream === 'function' ? new MediaStream([e.track as MediaStreamTrack]) : null)
      this.emitPeers()
    }
    pc.onnegotiationneeded = () => { void this.negotiate(p) }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && p.initiator) pc.restartIce?.()
      this.emitPeers()
    }
    if (p.initiator) {
      const t = pc.addTransceiver('audio', { direction: 'sendrecv' })
      p.sender = t.sender
      if (this.track) void t.sender.replaceTrack(this.track).catch(() => undefined)
    }
    return p
  }

  private async negotiate(p: Peer) {
    if (this.closed || this.peers.get(p.id) !== p) return
    try {
      p.makingOffer = true
      await p.pc.setLocalDescription()
      const d = p.pc.localDescription
      if (d) this.o.signaling.send({ type: 'description', from: this.o.selfId, to: p.id, description: { type: d.type as 'offer', sdp: d.sdp } })
    } catch { /* a newer negotiation will follow */ } finally { p.makingOffer = false }
  }

  private async handle(m: SignalMessage) {
    if (this.closed || m.from === this.o.selfId) return
    if ('to' in m && m.to && m.to !== this.o.selfId) return
    if (m.type === 'bye') { this.dropPeer(m.from); this.emitPeers(); return }
    const p = this.ensurePeer(m.from)
    if (m.type === 'state') { p.micOn = m.micOn; p.transmitting = m.transmitting; this.emitPeers(); return }
    const pc = p.pc
    try {
      if (m.type === 'description') {
        const d = m.description
        const collision = d.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable')
        p.ignoreOffer = !p.polite && collision
        if (p.ignoreOffer) return
        await pc.setRemoteDescription(d)           // the polite side rolls back implicitly on collision
        if (d.type === 'offer') {
          if (!p.sender) {
            const t = pc.getTransceivers().find((x) => x.receiver.track.kind === 'audio')
            if (t) { t.direction = 'sendrecv'; p.sender = t.sender; if (this.track) await t.sender.replaceTrack(this.track).catch(() => undefined) }
          }
          await pc.setLocalDescription()
          const a = pc.localDescription
          if (a) this.o.signaling.send({ type: 'description', from: this.o.selfId, to: p.id, description: { type: a.type as 'answer', sdp: a.sdp } })
        }
        for (const c of p.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => undefined)
      } else if (m.type === 'ice') {
        if (!pc.remoteDescription) { p.pendingIce.push(m.candidate); return }
        try { await pc.addIceCandidate(m.candidate) } catch (e) { if (!p.ignoreOffer) throw e }
      }
    } catch { /* malformed or stale signal: ignore, the connection state shows the outcome */ }
    this.emitPeers()
  }

  private dropPeer(id: string) {
    const p = this.peers.get(id)
    if (!p) return
    this.peers.delete(id)
    p.pc.onicecandidate = null; p.pc.ontrack = null; p.pc.onnegotiationneeded = null; p.pc.onconnectionstatechange = null
    try { p.pc.close() } catch { /* ignore */ }
  }

  private emitPeers() {
    const peers: PeerInfo[] = [...this.peers.values()].map((p) => ({ id: p.id, connection: String(p.pc.connectionState), stream: p.stream, micOn: p.micOn, transmitting: p.transmitting }))
    this.set({ peers })
  }

  private set(patch: Partial<VoiceSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    this.o.onChange?.(this.snap)
  }
}

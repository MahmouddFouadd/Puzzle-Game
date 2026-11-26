/**
 * Voice chat contracts. The core (VoiceChat) only talks to these interfaces, so the transport can change
 * (Supabase Realtime today; a local-network adapter could be added later) without touching the core.
 */

/** A message relayed by the signaling channel. Audio never travels through it: only SDP and ICE metadata. */
export type SignalMessage =
  | { type: 'description'; from: string; to: string; description: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string } }
  | { type: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'state'; from: string; to?: string; transmitting: boolean; micOn: boolean }
  | { type: 'bye'; from: string; to?: string }

export interface SignalingHandlers {
  /** A signal for this participant (the adapter drops messages addressed to someone else). */
  onMessage: (m: SignalMessage) => void
  /** Ids of every other participant currently in the voice channel. Called on every membership change. */
  onPeers: (ids: string[]) => void
  /** The channel itself failed (e.g. not authorised). */
  onError?: (reason: string) => void
}

export interface SignalingAdapter {
  connect(selfId: string, handlers: SignalingHandlers): Promise<void>
  send(m: SignalMessage): void
  disconnect(): Promise<void>
}

/** The subset of RTCPeerConnection the core uses; lets tests supply a fake. */
export interface PeerConnectionLike {
  connectionState: RTCPeerConnectionState | string
  signalingState: RTCSignalingState | string
  localDescription: { type: string; sdp?: string } | null
  remoteDescription: { type: string; sdp?: string } | null
  onicecandidate: ((e: { candidate: { toJSON?: () => RTCIceCandidateInit } & RTCIceCandidateInit | null }) => void) | null
  ontrack: ((e: { track: { kind: string }; streams: readonly MediaStream[] }) => void) | null
  onnegotiationneeded: (() => void) | null
  onconnectionstatechange: (() => void) | null
  addTransceiver(kind: 'audio', init: { direction: RTCRtpTransceiverDirection }): TransceiverLike
  getTransceivers(): TransceiverLike[]
  setLocalDescription(d?: { type: string; sdp?: string }): Promise<void>
  setRemoteDescription(d: { type: string; sdp?: string }): Promise<void>
  addIceCandidate(c: RTCIceCandidateInit): Promise<void>
  restartIce?(): void
  close(): void
}
export interface TransceiverLike {
  direction: RTCRtpTransceiverDirection | string
  sender: { replaceTrack(track: MediaStreamTrack | null): Promise<void> }
  receiver: { track: { kind: string } }
}

export type VoiceMode = 'open' | 'ptt'
export type MicState = 'off' | 'requesting' | 'on' | 'denied' | 'unavailable' | 'error'

export interface PeerInfo {
  id: string
  connection: string
  stream: MediaStream | null
  /** What the remote side last announced. */
  micOn: boolean
  transmitting: boolean
}

export interface VoiceSnapshot {
  joined: boolean
  joining: boolean
  error: string | null
  mic: MicState
  mode: VoiceMode
  pttDown: boolean
  /** True when our microphone audio is actually being sent. */
  transmitting: boolean
  peers: PeerInfo[]
}

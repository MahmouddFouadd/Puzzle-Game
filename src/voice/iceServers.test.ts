import { describe, expect, it } from 'vitest'
import { iceServers } from './iceServers'

describe('iceServers', () => {
  it('uses public STUN only by default', () => expect(iceServers({})).toEqual([{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]))
  it('adds TURN from the environment', () =>
    expect(iceServers({ VITE_TURN_URL: 'turn:a:3478, turns:a:5349', VITE_TURN_USERNAME: 'u', VITE_TURN_CREDENTIAL: 'p' })[1])
      .toEqual({ urls: ['turn:a:3478', 'turns:a:5349'], username: 'u', credential: 'p' }))
})

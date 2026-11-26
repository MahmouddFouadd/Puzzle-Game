/** STUN by default. TURN is optional (VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL); without it some
 *  strict networks (symmetric NAT, many mobile carriers) cannot connect peer to peer. */
export function iceServers(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  const urls = env.VITE_TURN_URL?.split(',').map((u) => u.trim()).filter(Boolean)
  if (urls?.length) servers.push({ urls, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL })
  return servers
}

/** Public web address used in links that people share. Inside the Android app the page origin is
 *  `https://localhost` (Capacitor), which is useless to anyone else, so links fall back to the live site. */
export const PUBLIC_SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || 'https://puzzle-game-652.pages.dev').replace(/\/+$/, '')

export function shareOrigin(origin: string = typeof window === 'undefined' ? '' : window.location.origin): string {
  try {
    const u = new URL(origin)
    const local = u.protocol === 'capacitor:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0'
    // A dev server on localhost:5173 is still shared as the public site; LAN/dev hosts other than localhost keep their origin.
    return local ? PUBLIC_SITE : u.origin
  } catch { return PUBLIC_SITE }
}

export const shareUrl = (path: string) => `${shareOrigin()}${path.startsWith('/') ? path : `/${path}`}`

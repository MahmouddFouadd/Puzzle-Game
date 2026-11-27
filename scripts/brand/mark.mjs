// FRIENDS ZONE mark geometry for static assets (mirror of src/brand/Logo.tsx; keep in sync).
export const defs = (id) => `
  <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7B55FF"/><stop offset=".55" stop-color="#6D4AFF"/><stop offset="1" stop-color="#3887FF"/></linearGradient>
  <radialGradient id="${id}glow" cx=".28" cy=".2" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}r1" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#E5B85C"/><stop offset=".45" stop-color="#F5F5FA" stop-opacity=".9"/><stop offset="1" stop-color="#20D5D2"/></linearGradient>
  <linearGradient id="${id}r2" x1="1" y1="1" x2="0" y2=".6"><stop offset="0" stop-color="#20D5D2"/><stop offset=".5" stop-color="#F5F5FA" stop-opacity=".9"/><stop offset="1" stop-color="#E5B85C"/></linearGradient>`
export const paths = (id, small = false, mono = null) => small
  ? `<path d="M176 186 H336 L176 326 H336" fill="none" stroke="${mono ?? '#F5F5FA'}" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="124" cy="124" r="52" fill="${mono ?? '#E5B85C'}"/><circle cx="388" cy="388" r="52" fill="${mono ?? '#20D5D2'}"/>`
  : `<path d="M136 136 A170 170 0 0 1 415.7 197.9" fill="none" stroke="${mono ?? `url(#${id}r1)`}" stroke-width="26" stroke-linecap="round"/>
     <path d="M376 376 A170 170 0 0 1 96.3 314.1" fill="none" stroke="${mono ?? `url(#${id}r2)`}" stroke-width="26" stroke-linecap="round"/>
     <path d="M190 198 H322 L190 314 H322" fill="none" stroke="${mono ?? '#F5F5FA'}" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="136" cy="136" r="38" fill="${mono ?? '#E5B85C'}"/><circle cx="376" cy="376" r="38" fill="${mono ?? '#20D5D2'}"/>`
export const tile = (id = 'fz', { small = false, rx = 118, full = false } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${defs(id)}</defs><rect width="512" height="512" rx="${full ? 0 : rx}" fill="url(#${id}bg)"/><rect width="512" height="512" rx="${full ? 0 : rx}" fill="url(#${id}glow)"/>${paths(id, small)}</svg>`
export const bare = (id = 'fzb', { mono = null, pad = 40 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${pad} ${pad} ${512 - 2 * pad} ${512 - 2 * pad}"><defs>${defs(id)}</defs>${paths(id, false, mono)}</svg>`
/** Mark scaled into a square canvas with a given fraction of padding (Android adaptive safe zone, maskable PWA). */
export const padded = (id, scale, bgFill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${defs(id)}</defs>${bgFill ? `<rect width="512" height="512" fill="${bgFill === 'brand' ? `url(#${id}bg)` : bgFill}"/>${bgFill === 'brand' ? `<rect width="512" height="512" fill="url(#${id}glow)"/>` : ''}` : ''}<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${paths(id)}</g></svg>`

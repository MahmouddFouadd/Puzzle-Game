import { useId } from 'react'

/**
 * FRIENDS ZONE logo system.
 * The mark: two friends (gold + cyan) each holding half of the "zone" ring, connected by the Z path.
 * All geometry lives on a 512 grid so every variant stays pixel-consistent.
 */
export const BRAND = {
  name: { en: 'FRIENDS ZONE', ar: 'فريندز زون' },
  short: 'FZ',
  tagline: { en: 'Your Friends. Your Games. Your Zone.', ar: 'عالم أصحابك.. واللعب مالوش حدود.' }
} as const

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7B55FF" /><stop offset=".55" stopColor="#6D4AFF" /><stop offset="1" stopColor="#3887FF" /></linearGradient>
      <radialGradient id={`${id}glow`} cx=".28" cy=".2" r=".85"><stop offset="0" stopColor="#fff" stopOpacity=".26" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}r1`} x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stopColor="#E5B85C" /><stop offset=".45" stopColor="#F5F5FA" stopOpacity=".9" /><stop offset="1" stopColor="#20D5D2" /></linearGradient>
      <linearGradient id={`${id}r2`} x1="1" y1="1" x2="0" y2=".6"><stop offset="0" stopColor="#20D5D2" /><stop offset=".5" stopColor="#F5F5FA" stopOpacity=".9" /><stop offset="1" stopColor="#E5B85C" /></linearGradient>
    </defs>
  )
}

function MarkPaths({ id, small = false, mono }: { id: string; small?: boolean; mono?: string }) {
  return (
    <>
      {!small && (
        <g>
          <path d="M136 136 A170 170 0 0 1 415.7 197.9" fill="none" stroke={mono ?? `url(#${id}r1)`} strokeWidth="26" strokeLinecap="round" />
          <path d="M376 376 A170 170 0 0 1 96.3 314.1" fill="none" stroke={mono ?? `url(#${id}r2)`} strokeWidth="26" strokeLinecap="round" />
        </g>
      )}
      <path d={small ? 'M176 186 H336 L176 326 H336' : 'M190 198 H322 L190 314 H322'} fill="none" stroke={mono ?? '#F5F5FA'} strokeWidth={small ? 64 : 48} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={small ? 124 : 136} cy={small ? 124 : 136} r={small ? 52 : 38} fill={mono ?? '#E5B85C'} />
      <circle cx={small ? 388 : 376} cy={small ? 388 : 376} r={small ? 52 : 38} fill={mono ?? '#20D5D2'} />
    </>
  )
}

/** App-icon style mark on the brand tile. `small` drops the ring for 16–24px use. */
export function FzMark({ size = 48, tile = true, small, mono, className, title }: { size?: number | string; tile?: boolean; small?: boolean; mono?: string; className?: string; title?: string }) {
  const id = `fz${useId().replace(/:/g, '')}`
  const tiny = small ?? (typeof size === 'number' && size <= 24)
  return (
    <svg viewBox={tile ? '0 0 512 512' : '40 40 432 432'} width={size} height={size} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <Defs id={id} />
      {tile && <><rect width="512" height="512" rx="118" fill={`url(#${id}bg)`} /><rect width="512" height="512" rx="118" fill={`url(#${id}glow)`} /></>}
      <MarkPaths id={id} small={tiny} mono={mono} />
    </svg>
  )
}

/** Wordmark with live text (keeps Arabic shaping correct). "ZONE" / "زون" carries the zone gradient. */
export function FzWordmark({ lang = 'en', size = 28, className = '' }: { lang?: 'en' | 'ar'; size?: number; className?: string }) {
  const zone = { backgroundImage: 'var(--fz-grad-zone)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } as const
  return (
    <span className={`inline-flex items-baseline gap-[.28em] whitespace-nowrap ${className}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}
      style={{ fontFamily: 'var(--fz-font-display)', fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: lang === 'en' ? '0.02em' : 0, color: 'var(--fz-white)' }}>
      {lang === 'ar' ? <><span>فريندز</span><span style={zone}>زون</span></> : <><span>FRIENDS</span><span style={zone}>ZONE</span></>}
    </span>
  )
}

/** Horizontal lockup: mark + wordmark (+ optional tagline). */
export function FzLogo({ lang = 'en', size = 40, tagline = false, className = '' }: { lang?: 'en' | 'ar'; size?: number; tagline?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <FzMark size={size} title={BRAND.name[lang]} />
      <span className="flex flex-col gap-1">
        <FzWordmark lang={lang} size={Math.round(size * 0.62)} />
        {tagline && <span style={{ fontFamily: 'var(--fz-font-text)', fontSize: Math.max(11, Math.round(size * 0.26)), color: 'var(--fz-gray)' }}>{BRAND.tagline[lang]}</span>}
      </span>
    </span>
  )
}

/** Loading animation: the friends travel the zone ring while the Z breathes. Respects reduced motion. */
export function FzLoader({ size = 72, label }: { size?: number; label?: string }) {
  const id = `fzl${useId().replace(/:/g, '')}`
  return (
    <span role="status" aria-label={label ?? 'Loading'} className="inline-grid place-items-center">
      <svg viewBox="40 40 432 432" width={size} height={size} aria-hidden="true">
        <Defs id={id} />
        <g className="fz-loader-ring">
          <path d="M136 136 A170 170 0 0 1 415.7 197.9" fill="none" stroke={`url(#${id}r1)`} strokeWidth="26" strokeLinecap="round" />
          <path d="M376 376 A170 170 0 0 1 96.3 314.1" fill="none" stroke={`url(#${id}r2)`} strokeWidth="26" strokeLinecap="round" />
          <circle cx="136" cy="136" r="38" fill="#E5B85C" /><circle cx="376" cy="376" r="38" fill="#20D5D2" />
        </g>
        <path className="fz-loader-z" d="M190 198 H322 L190 314 H322" fill="none" stroke="#F5F5FA" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** Original inline illustrations for the player-facing screens. Decorative: hidden from screen readers. */

export function StoryLogo({ className = 'h-24 w-24' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="lg-page" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fbf6ea" /><stop offset="1" stopColor="#e8d7aa" /></linearGradient>
        <linearGradient id="lg-gold" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#f3cf72" /><stop offset="1" stopColor="#c9962b" /></linearGradient>
        <radialGradient id="lg-glow"><stop offset="0" stopColor="#e0b34a" stopOpacity=".55" /><stop offset="1" stopColor="#e0b34a" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="60" cy="56" r="54" fill="url(#lg-glow)" />
      <path d="M14 82 Q37 70 60 82 Q83 70 106 82 L106 92 Q83 80 60 92 Q37 80 14 92Z" fill="#8a6214" />
      <path d="M16 38 Q38 28 59 40 L59 86 Q38 74 16 84Z" fill="url(#lg-page)" stroke="#a57619" strokeWidth="2" />
      <path d="M104 38 Q82 28 61 40 L61 86 Q82 74 104 84Z" fill="url(#lg-page)" stroke="#a57619" strokeWidth="2" />
      <path d="M24 48 Q38 42 51 50 M24 58 Q38 52 51 60 M24 68 Q38 62 51 70" stroke="#c9962b" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".6" />
      <path d="M70 34 h10 a6 6 0 1 1 10 0 h10 v10 a6 6 0 1 0 0 10 v10 h-10 a6 6 0 1 1 -10 0 h-10 v-10 a6 6 0 1 0 0 -10z"
        fill="url(#lg-gold)" stroke="#5b3f0b" strokeWidth="2" transform="rotate(-8 85 49)" />
      <circle cx="30" cy="22" r="2" fill="#f4ead2" /><circle cx="96" cy="18" r="2.5" fill="#e0b34a" /><circle cx="108" cy="40" r="1.6" fill="#f4ead2" />
    </svg>
  )
}

export function PuzzleArt({ className = 'mode-art' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <g stroke="#121118" strokeWidth="3">
        <path d="M10 40 h22 a9 9 0 1 1 18 0 h22 v22 a9 9 0 1 0 0 18 v22 h-62z" fill="#1f7a8c" />
        <path d="M72 40 h40 v62 h-40 v-22 a9 9 0 1 1 0 -18z" fill="#e0b34a" />
        <path d="M10 102 h62" fill="none" />
      </g>
      <circle cx="40" cy="70" r="8" fill="#f4ead2" opacity=".8" />
      <path d="M86 62 l8 -12 l8 12z" fill="#fbf6ea" opacity=".8" />
    </svg>
  )
}

export function MagnifierArt({ className = 'mode-art' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <rect x="18" y="22" width="62" height="78" rx="6" fill="#e8d7aa" stroke="#121118" strokeWidth="3" transform="rotate(-8 49 61)" />
      <path d="M30 42 h36 M30 54 h28 M30 66 h34" stroke="#a57619" strokeWidth="3" strokeLinecap="round" transform="rotate(-8 49 61)" />
      <circle cx="74" cy="66" r="22" fill="#1f7a8c" fillOpacity=".35" stroke="#e0b34a" strokeWidth="7" />
      <path d="M90 82 l20 20" stroke="#8a6214" strokeWidth="10" strokeLinecap="round" />
      <path d="M64 56 q6 -6 14 -2" stroke="#fbf6ea" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

const CREST_COLORS = ['#e0b34a', '#4fb3bf', '#e07a5f', '#81b29a', '#b8a1e3', '#f2cc8f', '#7fb3ff', '#f28bb2']
export const crestColor = (index: number) => CREST_COLORS[((index % CREST_COLORS.length) + CREST_COLORS.length) % CREST_COLORS.length]

/** Original glossy "3D" illustrations for the game hub. Decorative only. */
import type { ReactNode } from 'react'

const Gloss = ({ id, from, to }: { id: string; from: string; to: string }) => (
  <radialGradient id={id} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></radialGradient>
)
const Shine = ({ d }: { d: string }) => <path d={d} fill="#fff" opacity=".35" />

export function PuzzleBookArt({ className = 'ar-art' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <Gloss id="pb-piece" from="#ffe08a" to="#f08a1c" /><Gloss id="pb-blue" from="#7fd8ff" to="#1f6fd6" />
        <linearGradient id="pb-page" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fffaf0" /><stop offset="1" stopColor="#e9d6a8" /></linearGradient>
      </defs>
      <ellipse cx="80" cy="140" rx="52" ry="8" fill="#000" opacity=".25" />
      <path d="M22 108 Q50 94 80 108 Q110 94 138 108 L138 122 Q110 108 80 122 Q50 108 22 122Z" fill="#8a4b12" />
      <path d="M24 62 Q52 48 78 64 L78 116 Q52 100 24 112Z" fill="url(#pb-page)" stroke="#b07a2a" strokeWidth="2" />
      <path d="M136 62 Q108 48 82 64 L82 116 Q108 100 136 112Z" fill="url(#pb-page)" stroke="#b07a2a" strokeWidth="2" />
      <path d="M34 76 Q50 70 66 78 M34 88 Q50 82 66 90" stroke="#d8b46a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g transform="rotate(-12 96 52)">
        <path d="M78 26 h14 a9 9 0 1 1 16 0 h14 v14 a9 9 0 1 0 0 16 v14 h-14 a9 9 0 1 1 -16 0 h-14 v-14 a9 9 0 1 0 0 -16z" fill="url(#pb-piece)" stroke="#7a3f00" strokeWidth="2.5" />
        <Shine d="M84 32 q10 -4 18 0 q-8 4 -18 6z" />
      </g>
      <g transform="rotate(14 44 40)">
        <path d="M30 26 h10 a7 7 0 1 1 12 0 h10 v10 a7 7 0 1 0 0 12 v10 h-32z" fill="url(#pb-blue)" stroke="#0d3f8a" strokeWidth="2.5" />
      </g>
      <circle cx="130" cy="34" r="4" fill="#fff" opacity=".9" /><circle cx="20" cy="70" r="3" fill="#ffe08a" />
    </svg>
  )
}

export function SpyArt({ className = 'ar-art' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <Gloss id="sp-hat" from="#5b6bff" to="#1d1a6b" /><Gloss id="sp-face" from="#ffd9a8" to="#e59a5c" />
        <Gloss id="sp-mask" from="#ffcf4a" to="#e07a00" /><Gloss id="sp-q" from="#ff8fd0" to="#c2185b" />
      </defs>
      <ellipse cx="80" cy="144" rx="46" ry="7" fill="#000" opacity=".25" />
      <path d="M38 140 q42 -52 84 0z" fill="url(#sp-hat)" />
      <circle cx="80" cy="80" r="38" fill="url(#sp-face)" />
      <path d="M40 66 q40 -16 80 0 l2 22 q-42 -10 -84 0z" fill="url(#sp-mask)" stroke="#7a3f00" strokeWidth="2" />
      <ellipse cx="64" cy="76" rx="9" ry="7" fill="#1b1340" /><ellipse cx="96" cy="76" rx="9" ry="7" fill="#1b1340" />
      <circle cx="66" cy="74" r="2.5" fill="#fff" /><circle cx="98" cy="74" r="2.5" fill="#fff" />
      <path d="M68 100 q12 8 24 0" stroke="#7a3a1a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 54 q50 -40 100 0 q-6 -30 -50 -34 q-44 4 -50 34z" fill="url(#sp-hat)" stroke="#0d0b3a" strokeWidth="2" />
      <rect x="34" y="50" width="92" height="9" rx="4" fill="#ffb938" />
      <Shine d="M52 30 q20 -10 40 -4 q-22 2 -40 10z" />
      <g transform="translate(118 18)"><circle r="16" fill="url(#sp-q)" stroke="#6a0d3a" strokeWidth="2" />
        <text y="7" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff">?</text></g>
    </svg>
  )
}

export function DetectiveArt({ className = 'ar-art' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <Gloss id="dt-file" from="#fff4d6" to="#d9b56a" /><Gloss id="dt-ring" from="#ffe08a" to="#b8780f" />
        <radialGradient id="dt-lens" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#c8fff4" stopOpacity=".9" /><stop offset="1" stopColor="#14b8a6" stopOpacity=".55" /></radialGradient>
        <Gloss id="dt-handle" from="#8b5a2b" to="#3d2410" />
      </defs>
      <ellipse cx="80" cy="144" rx="50" ry="7" fill="#000" opacity=".25" />
      <g transform="rotate(-8 64 82)">
        <rect x="24" y="36" width="80" height="100" rx="8" fill="url(#dt-file)" stroke="#8a6214" strokeWidth="2.5" />
        <rect x="24" y="30" width="34" height="12" rx="4" fill="#d9b56a" />
        <path d="M36 62 h50 M36 76 h40 M36 90 h46" stroke="#a57619" strokeWidth="4" strokeLinecap="round" />
        <rect x="36" y="102" width="30" height="22" rx="3" fill="#ff5d5d" opacity=".85" />
      </g>
      <circle cx="104" cy="78" r="30" fill="url(#dt-lens)" stroke="url(#dt-ring)" strokeWidth="9" />
      <path d="M124 100 l22 24" stroke="url(#dt-handle)" strokeWidth="14" strokeLinecap="round" />
      <path d="M92 66 q8 -8 18 -4" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <g fill="none" stroke="#0f766e" strokeWidth="2" opacity=".8"><path d="M96 84 q8 -10 16 0" /><path d="M93 88 q11 -16 22 0" /><path d="M99 80 q5 -5 10 0" /></g>
      <circle cx="30" cy="30" r="3" fill="#fff" /><circle cx="140" cy="44" r="4" fill="#ffe08a" />
    </svg>
  )
}

export function Sparkles({ children }: { children?: ReactNode }) {
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {[[12, 18, 14], [84, 12, 10], [90, 70, 16], [8, 72, 10]].map(([x, y, s], i) => (
        <svg key={i} className="ar-float absolute" style={{ left: `${x}%`, top: `${y}%`, width: s * 2, height: s * 2, animationDelay: `${i * 0.6}s` }} viewBox="0 0 40 40">
          <defs><radialGradient id={`coin-${i}`} cx="35%" cy="30%"><stop offset="0" stopColor="#fff1b8" /><stop offset="1" stopColor="#d98a00" /></radialGradient></defs>
          {i % 2 === 0
            ? <><circle cx="20" cy="20" r="17" fill={`url(#coin-${i})`} stroke="#8a4b00" strokeWidth="2" /><path d="M20 10 l9 5 v10 l-9 5 l-9 -5 v-10z" fill="#e8442e" /></>
            : <path d="M20 2 l4 14 l14 4 l-14 4 l-4 14 l-4 -14 l-14 -4 l14 -4z" fill="#fff6c9" />}
        </svg>
      ))}
      {children}
    </span>
  )
}

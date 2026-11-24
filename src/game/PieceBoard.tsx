import { useEffect, useState } from 'react'
import { signedPieceUrl } from './api'
import type { PieceView } from './types'

/**
 * Shows ONLY the pieces this team has revealed, each at its exact position in the original image.
 * The full image is never sent to players, so the hidden part is drawn as fog instead of a blurred copy.
 */
export function PieceBoard({ width, height, pieces, label }: { width: number; height: number; pieces: PieceView[]; label: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    const missing = pieces.filter((p) => !urls[p.mask])
    if (missing.length === 0) return
    void Promise.all(missing.map(async (p) => [p.mask, await signedPieceUrl(p.mask).catch(() => '')] as const)).then((entries) => {
      if (alive) setUrls((u) => ({ ...u, ...Object.fromEntries(entries.filter(([, v]) => v)) }))
    })
    return () => { alive = false }
  }, [pieces, urls])

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto rounded-card" role="img" aria-label={label}>
      <defs>
        <pattern id="fog" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width="40" height="40" fill="#2b2a33" /><circle cx="10" cy="10" r="6" fill="#3b3550" /><circle cx="30" cy="28" r="9" fill="#1f7a8c" opacity="0.25" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#fog)" />
      {pieces.map((p) => urls[p.mask] ? <image key={p.id} href={urls[p.mask]} x={p.x} y={p.y} width={p.w} height={p.h} /> : null)}
    </svg>
  )
}

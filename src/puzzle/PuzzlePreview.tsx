import { useId } from 'react'
import type { PuzzleLayout } from './engine'

interface Props {
  imageUrl: string
  width: number
  height: number
  layout: PuzzleLayout
  revealed: ReadonlySet<number>
  showOutlines: boolean
  selected: number | null
  onPieceClick: (index: number) => void
}

/** Renders the real generated piece outlines over a blurred copy of the image. Revealed pieces show the exact image region. */
export function PuzzlePreview({ imageUrl, width, height, layout, revealed, showOutlines, selected, onPieceClick }: Props) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto rounded-card bg-ink-700" role="img" aria-label="Puzzle preview">
      <defs>
        <filter id={`${uid}-blur`}><feGaussianBlur stdDeviation={Math.max(width, height) / 30} /></filter>
        {layout.pieces.map((p, i) => <clipPath key={i} id={`${uid}-cp${i}`}><path d={p.path} /></clipPath>)}
      </defs>
      <image href={imageUrl} width={width} height={height} filter={`url(#${uid}-blur)`} preserveAspectRatio="none" />
      {layout.pieces.map((p, i) => (
        <g key={i} onClick={() => onPieceClick(i)} style={{ cursor: 'pointer' }}>
          {revealed.has(i) && <image href={imageUrl} width={width} height={height} clipPath={`url(#${uid}-cp${i})`} preserveAspectRatio="none" />}
          <path d={p.path} fill={selected === i ? 'rgba(224,179,74,0.35)' : 'transparent'}
            stroke={showOutlines || selected === i ? '#e0b34a' : 'none'} strokeWidth={Math.max(width, height) / 400} />
        </g>
      ))}
    </svg>
  )
}

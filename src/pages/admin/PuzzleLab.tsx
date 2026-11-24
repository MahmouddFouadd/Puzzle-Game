import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useI18n } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { generatePuzzle } from '../../puzzle/engine'
import { PuzzlePreview } from '../../puzzle/PuzzlePreview'

interface Loaded { url: string; width: number; height: number }
const defaultPieceLimits = { min: 4, max: 100 }

/** Admin tool: pick a local image, choose piece count + seed, inspect the real generated jigsaw. Nothing is uploaded. */
export default function PuzzleLab() {
  const { t } = useI18n()
  const [img, setImg] = useState<Loaded | null>(null)
  const [count, setCount] = useState(12)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000))
  const [outlines, setOutlines] = useState(true)
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set())
  const [selected, setSelected] = useState<number | null>(null)
  const [limits, setLimits] = useState(defaultPieceLimits)

  useEffect(() => {
    supabase.from('platform_settings').select('min_piece_count,max_piece_count').single().then(({ data }) => {
      if (!data) return
      const min = Math.max(1, Number(data.min_piece_count) || defaultPieceLimits.min)
      const max = Math.max(min, Number(data.max_piece_count) || defaultPieceLimits.max)
      setLimits({ min, max }); setCount((value) => Math.min(max, Math.max(min, value)))
    })
  }, [])

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url) }, [img])

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => { setImg({ url, width: el.naturalWidth, height: el.naturalHeight }); setRevealed(new Set()); setSelected(null) }
    el.onerror = () => URL.revokeObjectURL(url)
    el.src = url
  }

  const layout = useMemo(() => (img ? generatePuzzle({ width: img.width, height: img.height, pieceCount: count, seed }) : null), [img, count, seed])
  const piece = layout && selected !== null ? layout.pieces[selected] : null

  const click = (i: number) => {
    setSelected(i)
    setRevealed((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-3xl">{t('puzzleLab')}</h2>
      <div className="card grid gap-3 md:grid-cols-4">
        <label className="md:col-span-2 block">{t('chooseImage')}
          <input className="input mt-1" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} />
        </label>
        <label className="block">{t('pieceCount')}
          <input className="input mt-1" type="number" min={limits.min} max={limits.max} value={count}
            onChange={(e) => setCount(Math.min(limits.max, Math.max(limits.min, Math.floor(Number(e.target.value)) || limits.min)))} />
        </label>
        <label className="block">{t('seed')}
          <div className="flex gap-2 mt-1">
            <input className="input" type="number" value={seed} onChange={(e) => setSeed(Math.floor(Number(e.target.value)) || 0)} />
            <button className="btn-ghost" type="button" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>{t('randomize')}</button>
          </div>
        </label>
      </div>

      {img && layout && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-2"><input type="checkbox" checked={outlines} onChange={(e) => setOutlines(e.target.checked)} />{t('showOutlines')}</label>
            <button className="btn-ghost" type="button" onClick={() => setRevealed(new Set(layout.pieces.map((_, i) => i)))}>{t('revealAll')}</button>
            <button className="btn-ghost" type="button" onClick={() => setRevealed(new Set())}>{t('resetReveal')}</button>
          </div>
          <p className="text-sm opacity-70">{t('tapToReveal')}</p>
          <PuzzlePreview imageUrl={img.url} width={img.width} height={img.height} layout={layout}
            revealed={revealed} showOutlines={outlines} selected={selected} onPieceClick={click} />
          <div className="card text-sm grid gap-1 sm:grid-cols-3">
            <div>{t('imageSize')}: {img.width}×{img.height}</div>
            <div>{t('gridLabel')}: {layout.rows}×{layout.cols}</div>
            {piece && <div>{t('piece')} {piece.row + 1}-{piece.col + 1} · {t('pieceBox')}: {piece.bbox.x},{piece.bbox.y} {piece.bbox.w}×{piece.bbox.h}</div>}
          </div>
        </>
      )}
    </div>
  )
}

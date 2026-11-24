import { mulberry32 } from '../puzzle/engine'

export interface SugQuestion { id: string; text: string; explanation?: string | null; hint?: string | null }
export interface SugImage { id: string; title: string; description?: string | null; pieceIds: string[] }
export interface Suggestion { questionId: string; pieceId: string }

const STOP = new Set(['the', 'and', 'which', 'what', 'who', 'where', 'when', 'how', 'that', 'this', 'with', 'from', 'for', 'are', 'was', 'were', 'has', 'have', 'does', 'did', 'can', 'you', 'your', 'famous'])

export function tokenize(s: string): Set<string> {
  const norm = s.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '')
  return new Set(
    norm.split(/[^\p{L}\p{N}]+/u).map((w) => (w.startsWith('ال') && w.length > 4 ? w.slice(2) : w)).filter((w) => w.length >= 3 && !STOP.has(w))
  )
}

/**
 * Hybrid-assignment suggestion. Picks an image by keyword overlap with the image title/description
 * (ties and zero overlap go to the image with the most free capacity), then the least-loaded piece in a seeded shuffled order.
 * `keep` holds already-approved assignments: they are never changed but count toward piece load.
 */
export function suggestMappings(
  questions: SugQuestion[], images: SugImage[], keep: ReadonlyMap<string, string>, allowMultiple: boolean, seed = 1
): Suggestion[] {
  const rng = mulberry32(seed)
  const order = images.map((img) => {
    const a = [...img.pieceIds]
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
    return a
  })
  const load = new Map<string, number>()
  for (const p of keep.values()) load.set(p, (load.get(p) ?? 0) + 1)
  const imgTokens = images.map((img) => tokenize(`${img.title} ${img.description ?? ''}`))
  const free = (k: number): number =>
    allowMultiple ? order[k].length : order[k].filter((p) => (load.get(p) ?? 0) === 0).length

  const out: Suggestion[] = []
  for (const q of questions) {
    if (keep.has(q.id)) continue
    const qt = tokenize(`${q.text} ${q.explanation ?? ''} ${q.hint ?? ''}`)
    let best = -1, bestScore = -1, bestFree = -1
    images.forEach((_, k) => {
      if (order[k].length === 0 || free(k) === 0) return
      let score = 0
      for (const t of imgTokens[k]) if (qt.has(t)) score++
      // Without multi-question pieces: prefer the image with the most free pieces. With them: the one with the lowest average load.
      const f = allowMultiple ? -order[k].reduce((sum, p) => sum + (load.get(p) ?? 0), 0) / order[k].length : free(k) / order[k].length
      if (score > bestScore || (score === bestScore && f > bestFree)) { best = k; bestScore = score; bestFree = f }
    })
    if (best < 0) continue
    const piece = order[best].reduce((a, b) => ((load.get(b) ?? 0) < (load.get(a) ?? 0) ? b : a))
    load.set(piece, (load.get(piece) ?? 0) + 1)
    out.push({ questionId: q.id, pieceId: piece })
  }
  return out
}

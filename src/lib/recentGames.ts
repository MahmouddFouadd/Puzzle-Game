import type { HistoryRow } from '../bakasa/api'
import type { DetectiveHistoryRow } from '../detective/api'

export type GameMode = 'story' | 'detective' | 'bakasa'
/** One row of the Home "recent games" list, built only from real history returned by the server. */
export interface RecentGame {
  id: string; mode: GameMode; title: string; titleAr: string; at: string
  status: 'active' | 'finished'; score: number | null; won: boolean | null; detail: { en: string; ar: string } | null
  href: string | null; action: 'continue' | 'result' | null
}
export interface PlayerStats { gamesPlayed: number; wins: number; totalScore: number; bestDetectiveScore: number | null; casesSolved: number }

export function bakasaToRecent(r: HistoryRow): RecentGame {
  const finished = r.status === 'FINISHED' || r.status === 'CLOSED'
  const won = finished && r.top_score > 0 && r.my_score === r.top_score
  return {
    id: `bakasa:${r.room_id}`, mode: 'bakasa', title: r.name || r.code, titleAr: r.name || r.code, at: r.created_at,
    status: finished ? 'finished' : 'active', score: r.my_score, won: finished ? won : null,
    detail: { en: `${r.players} ${r.players === 1 ? 'player' : 'players'} · ${r.rounds} ${r.rounds === 1 ? 'round' : 'rounds'}`, ar: `${r.players} لاعبين · ${r.rounds} ${r.rounds === 1 ? 'جولة' : 'جولات'}` },
    href: finished ? null : `/bakasa/room/${r.room_id}`, action: finished ? null : 'continue'
  }
}

export function detectiveToRecent(r: DetectiveHistoryRow): RecentGame {
  const done = !!r.completed_at
  return {
    id: `detective:${r.session_id}`, mode: 'detective', title: r.title, titleAr: r.title_ar || r.title, at: r.completed_at ?? r.started_at,
    status: done ? 'finished' : 'active', score: r.score, won: null,
    detail: { en: `${r.found}/${r.total} clues`, ar: `${r.found}/${r.total} أدلة` },
    href: done ? `/detective/report/${r.session_id}` : `/detective/session/${r.session_id}`, action: done ? 'result' : 'continue'
  }
}

/** Merge, newest first. Nothing is invented: Story Puzzle has no per-player history yet, so it never appears here. */
export function mergeRecent(bakasa: HistoryRow[], detective: DetectiveHistoryRow[], limit = 6): RecentGame[] {
  return [...bakasa.map(bakasaToRecent), ...detective.map(detectiveToRecent)]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit)
}

export function computeStats(bakasa: HistoryRow[], detective: DetectiveHistoryRow[]): PlayerStats {
  const finishedB = bakasa.filter((r) => r.status === 'FINISHED' || r.status === 'CLOSED')
  const doneD = detective.filter((r) => !!r.completed_at)
  return {
    gamesPlayed: finishedB.length + doneD.length,
    wins: finishedB.filter((r) => r.top_score > 0 && r.my_score === r.top_score).length,
    totalScore: finishedB.reduce((s, r) => s + r.my_score, 0) + doneD.reduce((s, r) => s + r.score, 0),
    bestDetectiveScore: doneD.length ? Math.max(...doneD.map((r) => r.score)) : null,
    casesSolved: doneD.length
  }
}

/** Universal room code router: BK- → Bakasa, DT- → Detective party, anything else → Story Puzzle join. */
export function routeForCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/\s+/g, '').trim()
  if (!c) return null
  if (/^BK-?[A-Z0-9]{6}$/.test(c)) return `/bakasa/join/BK-${c.replace(/^BK-?/, '')}`
  if (/^DT-?[A-Z0-9]{6}$/.test(c)) return `/detective/join/DT-${c.replace(/^DT-?/, '')}`
  return `/join/${encodeURIComponent(c)}`
}

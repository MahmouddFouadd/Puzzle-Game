import { describe, expect, it } from 'vitest'
import { computeStats, mergeRecent, routeForCode } from './recentGames'
import type { HistoryRow } from '../bakasa/api'
import type { DetectiveHistoryRow } from '../detective/api'

const bk = (o: Partial<HistoryRow>): HistoryRow => ({ room_id: 'r', name: 'Room', code: 'BK-AAAAAA', created_at: '2026-11-20T10:00:00Z', status: 'FINISHED', rounds: 3, players: 4, my_score: 5, winner: 'x', top_score: 9, spy_wins: 1, player_wins: 2, ...o })
const dt = (o: Partial<DetectiveHistoryRow>): DetectiveHistoryRow => ({ session_id: 's', case_id: 'c', title: 'Case', title_ar: 'قضية', difficulty: 2, started_at: '2026-11-21T10:00:00Z', completed_at: null, score: 0, duration_seconds: null, found: 1, total: 9, ...o })

describe('recent games', () => {
  it('merges both histories newest first and links only to real routes', () => {
    const r = mergeRecent([bk({ room_id: 'a', created_at: '2026-11-20T10:00:00Z' }), bk({ room_id: 'b', status: 'PLAYING', created_at: '2026-11-25T10:00:00Z' })],
      [dt({ session_id: 'x', started_at: '2026-11-22T10:00:00Z' }), dt({ session_id: 'y', completed_at: '2026-11-24T10:00:00Z', score: 120 })])
    expect(r.map((g) => g.id)).toEqual(['bakasa:b', 'detective:y', 'detective:x', 'bakasa:a'])
    expect(r[0]).toMatchObject({ status: 'active', action: 'continue', href: '/bakasa/room/b' })
    expect(r[1]).toMatchObject({ status: 'finished', action: 'result', href: '/detective/report/y', score: 120 })
    expect(r[2]).toMatchObject({ action: 'continue', href: '/detective/session/x' })
    expect(r[3]).toMatchObject({ href: null, action: null, won: false })
  })
  it('returns nothing when there is no history (no invented games)', () => { expect(mergeRecent([], [])).toEqual([]) })
  it('limits the list', () => { expect(mergeRecent(Array.from({ length: 10 }, (_, i) => bk({ room_id: String(i) })), [], 4)).toHaveLength(4) })
})

describe('player stats', () => {
  it('counts only finished games and real wins', () => {
    const s = computeStats([bk({ my_score: 9, top_score: 9 }), bk({ my_score: 3 }), bk({ status: 'PLAYING', my_score: 50 })], [dt({ completed_at: '2026-11-24T10:00:00Z', score: 80 }), dt({})])
    expect(s).toEqual({ gamesPlayed: 3, wins: 1, totalScore: 9 + 3 + 80, bestDetectiveScore: 80, casesSolved: 1 })
  })
  it('a zero-score tie is not a win; no detective cases gives no best score', () => {
    expect(computeStats([bk({ my_score: 0, top_score: 0 })], [])).toEqual({ gamesPlayed: 1, wins: 0, totalScore: 0, bestDetectiveScore: null, casesSolved: 0 })
  })
})

describe('room code routing', () => {
  it('sends each code prefix to its game', () => {
    expect(routeForCode('bk-ab12cd')).toBe('/bakasa/join/BK-AB12CD')
    expect(routeForCode('DTAB12CD')).toBe('/detective/join/DT-AB12CD')
    expect(routeForCode(' al-7k2p9x ')).toBe('/join/AL-7K2P9X')
    expect(routeForCode('   ')).toBeNull()
  })
})

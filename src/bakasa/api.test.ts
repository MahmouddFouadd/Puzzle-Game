import { describe, expect, it } from 'vitest'
import { bakasaError, DEFAULT_SETTINGS } from './api'

describe('Bakasa client helpers', () => {
  it('maps server error codes to Arabic and English messages', () => {
    expect(bakasaError(new Error('cannot_vote_self'), true)).toBe('مينفعش تصوّت لنفسك!')
    expect(bakasaError(new Error('P0001: not_enough_players'), false)).toMatch(/3 players/)
    expect(bakasaError(new Error('TypeError: Failed to fetch'), true)).toMatch(/الاتصال/)
    expect(bakasaError('weird', false)).toMatch(/Something went wrong/)
  })
  it('defaults match the server defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ spies: 1, rounds: 3, min_players: 3, max_players: 12, tie_rule: 'REVOTE', final_guess: true })
  })
})

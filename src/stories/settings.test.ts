import { describe, expect, it } from 'vitest'
import { effective, settingsProblems, toRow, type SettingKey, type SettingsValues } from './settings'

const defaults: SettingsValues = {
  points_correct_place: 10, points_wrong_place: -10, points_correct_discard: 0, points_wrong_discard: -10, points_wrong_answer: -10,
  wrong_answer_policy: 'MINUS', max_attempts: 1, reveal_answer_after_fail: true, card_time_limit_seconds: 30,
  allow_multiple_questions_per_piece: false, allow_deck_recycling: false,
  max_recycle_cycles: 1, rescue_enabled: false, max_rescue_draws: 2, rescue_cost_points: 0, rescue_cards_repeatable: false, captain_grace_seconds: 20
}

describe('effective settings', () => {
  it('follows defaults when nothing is overridden', () => expect(effective(defaults, null)).toEqual(defaults))
  it('explicit story values win, others keep following defaults', () => {
    const e = effective(defaults, { points_correct_place: 20, wrong_answer_policy: 'RETRY', max_attempts: null })
    expect(e.points_correct_place).toBe(20); expect(e.wrong_answer_policy).toBe('RETRY'); expect(e.max_attempts).toBe(1)
  })
  it('an explicit override survives a later change of platform defaults', () => {
    const story = { points_correct_place: 15 }
    expect(effective({ ...defaults, points_correct_place: 99 }, story).points_correct_place).toBe(15)
    expect(effective({ ...defaults, points_wrong_place: -50 }, story).points_wrong_place).toBe(-50)
  })
  it('time limit 0 means explicitly no limit even when the platform has one', () => {
    expect(effective(defaults, { card_time_limit_seconds: 0 }).card_time_limit_seconds).toBeNull()
  })
})

describe('settingsProblems / toRow', () => {
  it('only checks overridden keys', () => {
    const v = { ...defaults, points_correct_place: 5000 }
    expect(settingsProblems(v, new Set<SettingKey>())).toEqual([])
    expect(settingsProblems(v, new Set<SettingKey>(['points_correct_place']))).toEqual(['points_correct_place'])
  })
  it('rejects bad attempts and time limits', () => {
    const c = new Set<SettingKey>(['max_attempts', 'card_time_limit_seconds'])
    expect(settingsProblems({ ...defaults, max_attempts: 0, card_time_limit_seconds: 3 }, c)).toEqual(['max_attempts', 'card_time_limit_seconds'])
    expect(settingsProblems({ ...defaults, max_attempts: 3, card_time_limit_seconds: 0 }, c)).toEqual([])
  })
  it('checks recovery and failover ranges', () => {
    const c = new Set<SettingKey>(['max_recycle_cycles', 'max_rescue_draws', 'rescue_cost_points', 'captain_grace_seconds'])
    expect(settingsProblems({ ...defaults, max_recycle_cycles: 9, max_rescue_draws: 11, rescue_cost_points: -1, captain_grace_seconds: 1 }, c)).toHaveLength(4)
    expect(settingsProblems({ ...defaults, max_recycle_cycles: 2, max_rescue_draws: 3, rescue_cost_points: 5, captain_grace_seconds: 30 }, c)).toEqual([])
  })
  it('writes null for non-overridden keys', () => {
    const row = toRow({ ...defaults, points_correct_place: 12 }, new Set<SettingKey>(['points_correct_place']))
    expect(row.points_correct_place).toBe(12); expect(row.points_wrong_place).toBeNull(); expect(row.card_time_limit_seconds).toBeNull()
  })
})

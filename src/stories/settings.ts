export type Policy = 'MINUS' | 'RETRY' | 'SKIP'
export interface SettingsValues {
  points_correct_place: number; points_wrong_place: number; points_correct_discard: number; points_wrong_discard: number
  points_wrong_answer: number; wrong_answer_policy: Policy; max_attempts: number; reveal_answer_after_fail: boolean
  card_time_limit_seconds: number | null; allow_multiple_questions_per_piece: boolean; allow_deck_recycling: boolean
  max_recycle_cycles: number; rescue_enabled: boolean; max_rescue_draws: number; rescue_cost_points: number; rescue_cards_repeatable: boolean; captain_grace_seconds: number
}
export type SettingKey = keyof SettingsValues
export type Overrides = { [K in SettingKey]: SettingsValues[K] | null }

export const KEYS: SettingKey[] = [
  'points_correct_place', 'points_wrong_place', 'points_correct_discard', 'points_wrong_discard', 'points_wrong_answer',
  'wrong_answer_policy', 'max_attempts', 'reveal_answer_after_fail', 'card_time_limit_seconds',
  'allow_multiple_questions_per_piece', 'allow_deck_recycling', 'max_recycle_cycles', 'rescue_enabled', 'max_rescue_draws', 'rescue_cost_points',
  'rescue_cards_repeatable', 'captain_grace_seconds'
]

/** Story overrides win; null means "follow the platform default". Time limit 0 means explicitly none. */
export function effective(defaults: SettingsValues, o: Partial<Overrides> | null): SettingsValues {
  const out: Record<string, unknown> = { ...defaults }
  for (const k of KEYS) { const v = o?.[k]; if (v !== null && v !== undefined) out[k] = k === 'card_time_limit_seconds' && v === 0 ? null : v }
  return out as unknown as SettingsValues
}

/** Validation of the keys the admin chose to override. Mirrors the database CHECK constraints. */
export function settingsProblems(vals: SettingsValues, custom: ReadonlySet<SettingKey>): SettingKey[] {
  const bad: SettingKey[] = []
  const pointKeys: SettingKey[] = ['points_correct_place', 'points_wrong_place', 'points_correct_discard', 'points_wrong_discard', 'points_wrong_answer']
  for (const k of pointKeys) if (custom.has(k)) { const v = vals[k] as number; if (!Number.isInteger(v) || v < -1000 || v > 1000) bad.push(k) }
  if (custom.has('max_attempts') && (!Number.isInteger(vals.max_attempts) || vals.max_attempts < 1 || vals.max_attempts > 10)) bad.push('max_attempts')
  const ranges: [SettingKey, number, number][] = [['max_recycle_cycles', 0, 5], ['max_rescue_draws', 0, 10], ['rescue_cost_points', 0, 1000], ['captain_grace_seconds', 5, 300]]
  for (const [k, lo, hi] of ranges) if (custom.has(k)) { const v = vals[k] as number; if (!Number.isInteger(v) || v < lo || v > hi) bad.push(k) }
  if (custom.has('card_time_limit_seconds')) {
    const t = vals.card_time_limit_seconds ?? 0
    if (!Number.isInteger(t) || !(t === 0 || (t >= 5 && t <= 3600))) bad.push('card_time_limit_seconds')
  }
  return bad
}

export function toRow(vals: SettingsValues, custom: ReadonlySet<SettingKey>): Overrides {
  const row = {} as Record<string, unknown>
  for (const k of KEYS) row[k] = custom.has(k) ? (k === 'card_time_limit_seconds' ? vals[k] ?? 0 : vals[k]) : null
  return row as Overrides
}

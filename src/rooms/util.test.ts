import { describe, expect, it } from 'vitest'
import { isValidCode, joinUrl, normalizeCode, secondsLeft, teamNamesFromText } from './util'
import { errorKey } from '../stories/errors'

describe('room codes', () => {
  it('normalizes typed input', () => {
    expect(normalizeCode('di abc123')).toBe('DI-ABC123')
    expect(normalizeCode('di-abc123')).toBe('DI-ABC123')
    expect(normalizeCode('d')).toBe('D')
  })
  it('validates the server format', () => {
    expect(isValidCode('DI-K7P29X')).toBe(true)
    expect(isValidCode('DIK7P29X')).toBe(false)
    expect(isValidCode('DI-K7P29')).toBe(false)
  })
  it('builds a join link', () => expect(joinUrl('https://x.app', 'DI-K7P29X')).toBe('https://x.app/join/DI-K7P29X'))
})
describe('countdown', () => {
  const end = new Date(10_000).toISOString()
  it('counts whole seconds and never goes negative', () => {
    expect(secondsLeft(end, 7_001)).toBe(3)
    expect(secondsLeft(end, 9_999)).toBe(1)
    expect(secondsLeft(end, 20_000)).toBe(0)
    expect(secondsLeft(null, 0)).toBe(0)
  })
})
describe('helpers', () => {
  it('splits team names', () => expect(teamNamesFromText(' A \n\nB\n')).toEqual(['A', 'B']))
  it('maps room errors to localized keys', () => {
    expect(errorKey(new Error('image_taken'))).toBe('err_image_taken')
    expect(errorKey(new Error('team_full'))).toBe('err_team_full')
    expect(errorKey(new Error('captain_only'))).toBe('err_captain_only')
    expect(errorKey(new Error('story_in_use'))).toBe('err_story_in_use')
    expect(errorKey(new Error('something odd'))).toBe('errGeneric')
  })
})

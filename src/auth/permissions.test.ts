import { describe, expect, it } from 'vitest'
import { can } from './permissions'
import { translate } from '../lib/i18n'

describe('can()', () => {
  it('wildcard grants everything', () => expect(can(new Set(['*']), 'story.manage')).toBe(true))
  it('exact permission grants', () => expect(can(new Set(['room.manage']), 'room.manage')).toBe(true))
  it('missing permission denies', () => expect(can(new Set(['room.manage']), 'user.manage')).toBe(false))
  it('empty set denies', () => expect(can(new Set(), 'story.manage')).toBe(false))
})

describe('i18n', () => {
  it('has Arabic and English for the same keys', () => {
    expect(translate('ar', 'dashboard')).not.toBe(translate('en', 'dashboard'))
  })
})

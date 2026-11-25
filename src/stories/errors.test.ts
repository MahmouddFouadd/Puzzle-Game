import { describe, expect, it } from 'vitest'
import { errorKey, isMappingsConflict } from './errors'

describe('errorKey', () => {
  it('maps known codes', () => {
    expect(errorKey(new Error('unsupported_type'))).toBe('errUnsupported')
    expect(errorKey(new Error('file_too_large'))).toBe('errTooLarge')
    expect(errorKey(new Error('story_published'))).toBe('errPublished')
    expect(errorKey(new Error('invalid_question'))).toBe('errInvalidQuestion')
    expect(errorKey(new Error('piece_taken'))).toBe('errPieceTaken')
    expect(errorKey(new Error('validation_failed'))).toBe('errValidation')
    expect(errorKey(new Error('image_download_failed'))).toBe('errImageUnavailable')
    expect(errorKey(new Error('invalid_image_response'))).toBe('errImageUnavailable')
  })
  it('hides unknown technical errors behind a generic message', () => {
    expect(errorKey(new Error('duplicate key value violates unique constraint'))).toBe('errGeneric')
    expect(errorKey('weird')).toBe('errGeneric')
  })
  it('detects the mappings conflict', () => {
    expect(isMappingsConflict(new Error('mappings_exist:3'))).toBe(true)
    expect(isMappingsConflict(new Error('other'))).toBe(false)
  })
})

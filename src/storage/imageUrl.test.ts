import { describe, expect, it } from 'vitest'
import { classifyImageReference } from './imageUrl'

const supabaseUrl = 'https://zrbvgtqspekxrnnzegwh.supabase.co'

describe('classifyImageReference', () => {
  it('returns external HTTPS image URLs directly', () => {
    const url = 'https://files.manuscdn.com/user_upload/image.jpg?download=1'
    expect(classifyImageReference(url, 'story-originals', supabaseUrl)).toEqual({ kind: 'external', url })
  })

  it('returns external HTTP URLs directly without treating them as storage keys', () => {
    const url = 'http://images.example.test/story.png'
    expect(classifyImageReference(url, 'story-originals', supabaseUrl)).toEqual({ kind: 'external', url })
  })

  it('uses the default bucket for a valid relative object path', () => {
    expect(classifyImageReference('content-library/ab/asset.jpg', 'story-originals', supabaseUrl)).toEqual({
      kind: 'storage', bucket: 'story-originals', path: 'content-library/ab/asset.jpg'
    })
  })

  it('extracts an object key from an expired signed Storage URL to allow re-signing', () => {
    const reference = `${supabaseUrl}/storage/v1/object/sign/story-originals/content-library/ab/photo%20one.jpg?token=expired`
    expect(classifyImageReference(reference, 'story-pieces', supabaseUrl)).toEqual({
      kind: 'storage', bucket: 'story-originals', path: 'content-library/ab/photo one.jpg'
    })
  })

  it('recognizes Storage public and authenticated URLs for the current project', () => {
    expect(classifyImageReference(`${supabaseUrl}/storage/v1/object/public/story-pieces/image/part.png`, 'story-originals', supabaseUrl)).toEqual({
      kind: 'storage', bucket: 'story-pieces', path: 'image/part.png'
    })
    expect(classifyImageReference(`${supabaseUrl}/storage/v1/object/authenticated/story-originals/a.jpg`, 'story-pieces', supabaseUrl)).toEqual({
      kind: 'storage', bucket: 'story-originals', path: 'a.jpg'
    })
  })

  it('does not reinterpret a Supabase URL from a different project', () => {
    const url = 'https://other-project.supabase.co/storage/v1/object/sign/story-originals/a.jpg?token=expired'
    expect(classifyImageReference(url, 'story-originals', supabaseUrl)).toEqual({ kind: 'external', url })
  })

  it.each(['', '   ', '//files.example.test/a.jpg', 'data:image/png;base64,AA==', 'folder/../secret.jpg', '/rooted/file.jpg', 'a\\b.jpg'])('rejects invalid image references: %s', (reference) => {
    expect(() => classifyImageReference(reference, 'story-originals', supabaseUrl)).toThrow()
  })
})

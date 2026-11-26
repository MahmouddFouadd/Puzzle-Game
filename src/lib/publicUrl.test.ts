import { describe, expect, it } from 'vitest'
import { PUBLIC_SITE, shareOrigin } from './publicUrl'

describe('shareOrigin', () => {
  it('replaces the Android app origin with the public site', () => {
    expect(shareOrigin('https://localhost')).toBe(PUBLIC_SITE)
    expect(shareOrigin('capacitor://localhost')).toBe(PUBLIC_SITE)
    expect(shareOrigin('http://localhost:5173')).toBe(PUBLIC_SITE)
  })
  it('keeps real web origins', () => {
    expect(shareOrigin('https://puzzle-game-652.pages.dev')).toBe('https://puzzle-game-652.pages.dev')
    expect(shareOrigin('https://preview.example.dev')).toBe('https://preview.example.dev')
  })
  it('falls back to the public site for garbage', () => expect(shareOrigin('not a url')).toBe(PUBLIC_SITE))
})

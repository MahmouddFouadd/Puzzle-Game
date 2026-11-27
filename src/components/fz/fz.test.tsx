import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { GameModeCard } from './GameModeCard'
import { EmptyState } from './EmptyState'
import { PrimaryActionButton } from './PrimaryActionButton'
import { NAV_ITEMS, BottomNav } from './MainNavigation'
import { IconStory, IconPlay } from '../../brand/icons'
import { FzMark, FzWordmark } from '../../brand/Logo'

beforeAll(() => {
  const store = new Map<string, string>([['lang', 'ar']])
  ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
})
const html = (node: ReactNode, path = '/') => renderToString(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>)

describe('Friends Zone components', () => {
  it('GameModeCard is one accessible link to the mode route with its accent', () => {
    const out = html(<GameModeCard to="/detective" accent="var(--fz-mode-detective)" title="Detective" description="Find clues" playLabel="Play" Icon={IconStory} />)
    expect(out).toContain('href="/detective"')
    expect(out).toContain('aria-label="Detective – Play"')
    expect(out).toContain('--accent:var(--fz-mode-detective)')
    expect(out.match(/<a /g)).toHaveLength(1)
  })
  it('PrimaryActionButton renders a link, an in-page anchor, or a real button', () => {
    expect(html(<PrimaryActionButton to="/play/new">Create</PrimaryActionButton>)).toContain('href="/play/new"')
    expect(html(<PrimaryActionButton to="#join">Join</PrimaryActionButton>)).toMatch(/<a href="#join" class="fz-btn fz-btn-primary/)
    const b = html(<PrimaryActionButton type="submit" variant="outline" disabled>Go</PrimaryActionButton>)
    expect(b).toMatch(/<button type="submit" class="fz-btn fz-btn-outline[^"]*" disabled/)
  })
  it('EmptyState shows title and text', () => {
    const out = html(<EmptyState Icon={IconPlay} title="No games yet" text="Play one" />)
    expect(out).toContain('No games yet'); expect(out).toContain('Play one')
  })
  it('every navigation target is an existing route in App.tsx', () => {
    const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')
    const routes = new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))
    for (const item of NAV_ITEMS) {
      const ok = routes.has(item.to) || [...routes].some((r) => r.includes(':') && new RegExp(`^${r.replace(/:[^/]+/g, '[^/]+')}$`).test(item.to))
      expect(ok, `${item.to} must be a real route`).toBe(true)
    }
  })
  it('bottom navigation marks the current page and labels links in Arabic', async () => {
    const { I18nProvider } = await import('../../lib/i18n')
    const out = html(<I18nProvider><BottomNav /></I18nProvider>, '/detective')
    expect(out.match(/class="fz-bottom-link/g)).toHaveLength(5)
    expect(out).toMatch(/href="\/detective"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/detective"/)
    expect(out).toContain('الرئيسية')
  })
  it('logo renders an accessible mark and the bilingual wordmark', () => {
    expect(renderToString(<FzMark size={48} title="Friends Zone" />)).toContain('aria-label="Friends Zone"')
    expect(renderToString(<FzMark size={16} />)).not.toContain('A170 170')   // small variant drops the ring
    expect(renderToString(<FzWordmark lang="ar" />)).toContain('زون')
    expect(renderToString(<FzWordmark lang="en" />)).toContain('ZONE')
  })
})

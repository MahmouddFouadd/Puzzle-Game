import { describe, expect, it } from 'vitest'
import {
  canAccessAdminRoutes,
  canAccessPlayerRoutes,
  defaultAuthenticatedPath,
  defaultLandingPath,
  resolveAppVariant
} from './appVariant'

describe('app variants', () => {
  it('keeps the existing full web app when no native variant is specified', () => {
    const variant = resolveAppVariant(undefined)
    expect(variant).toBe('web')
    expect(canAccessAdminRoutes(variant)).toBe(true)
    expect(canAccessPlayerRoutes(variant)).toBe(true)
    expect(defaultLandingPath(variant)).toBe('/join')
    expect(defaultAuthenticatedPath(variant)).toBe('/admin')
  })

  it('limits the Admin APK to admin routes and sends login to the dashboard', () => {
    const variant = resolveAppVariant('admin')
    expect(canAccessAdminRoutes(variant)).toBe(true)
    expect(canAccessPlayerRoutes(variant)).toBe(false)
    expect(defaultLandingPath(variant)).toBe('/admin/stories')
    expect(defaultAuthenticatedPath(variant)).toBe('/admin')
  })

  it('limits the User APK to player routes and keeps admin routes out of its route table', () => {
    const variant = resolveAppVariant('user')
    expect(canAccessAdminRoutes(variant)).toBe(false)
    expect(canAccessPlayerRoutes(variant)).toBe(true)
    expect(defaultLandingPath(variant)).toBe('/join')
    expect(defaultAuthenticatedPath(variant)).toBe('/join')
  })

  it('falls back to the full web app for unrecognized values', () => {
    expect(resolveAppVariant('unexpected')).toBe('web')
  })
})

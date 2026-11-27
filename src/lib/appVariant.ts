export type AppVariant = 'web' | 'admin' | 'user'

export function resolveAppVariant(value?: string): AppVariant {
  if (value === 'admin' || value === 'user') return value
  return 'web'
}

export function canAccessAdminRoutes(variant: AppVariant): boolean {
  return variant !== 'user'
}

export function canAccessPlayerRoutes(variant: AppVariant): boolean {
  return variant !== 'admin'
}

export function defaultLandingPath(variant: AppVariant): string {
  return variant === 'admin' ? '/admin' : '/'
}

export function defaultAuthenticatedPath(variant: AppVariant): string {
  if (variant === 'user') return '/'
  return '/admin'
}

export const APP_VARIANT = resolveAppVariant(import.meta.env.VITE_APP_VARIANT)

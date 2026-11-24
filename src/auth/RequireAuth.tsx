import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { useI18n } from '../lib/i18n'

export function RequireAuth({ permission, children }: { permission?: string; children: ReactNode }) {
  const { session, loading, can } = useAuth()
  const { t } = useI18n()
  if (loading) return <p className="p-6" role="status">{t('loading')}</p>
  if (!session) return <Navigate to="/login" replace />
  if (permission && !can(permission)) return <p className="p-6 text-danger" role="alert">{t('notAllowed')}</p>
  return <>{children}</>
}

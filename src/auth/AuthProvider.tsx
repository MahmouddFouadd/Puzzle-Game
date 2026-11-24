import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { can } from './permissions'

interface AuthCtx {
  session: Session | null
  loading: boolean
  permissions: ReadonlySet<string>
  can: (p: string) => boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signInAnonymously: (displayName: string) => Promise<string | null>
  signOut: () => Promise<void>
}
const Auth = createContext<AuthCtx | null>(null)

async function loadPermissions(userId: string): Promise<Set<string>> {
  const { data: roles, error } = await supabase.from('user_roles').select('role').eq('user_id', userId)
  if (error || !roles?.length) return new Set()
  // SUPER_ADMIN is a database-defined wildcard role. Keep the UI gate aligned
  // with that authoritative rule even if the secondary permission query is
  // delayed or filtered by a temporary RLS/session refresh.
  if (roles.some((r) => r.role === 'SUPER_ADMIN')) return new Set(['*'])
  const { data: perms } = await supabase.from('role_permissions').select('permission').in('role', roles.map((r) => r.role))
  const result = new Set((perms ?? []).map((p) => p.permission as string))
  // The RPC is SECURITY DEFINER and evaluates the same server-side rule used
  // by RLS and protected mutations. It keeps the UI usable if the public
  // permission lookup is temporarily unavailable after a fresh login.
  const candidates = ['report.view', 'story.manage', 'room.manage', 'user.manage', 'game.control']
  const checks = await Promise.all(candidates.map(async (permission) => {
    const { data } = await supabase.rpc('has_permission', { p: permission })
    return data === true ? permission : null
  }))
  for (const permission of checks) if (permission) result.add(permission)
  return result
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let active = true
    const apply = async (s: Session | null) => {
      const perms = s ? await loadPermissions(s.user.id) : new Set<string>()
      if (!active) return
      setSession(s); setPermissions(perms); setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { void apply(s) })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const value: AuthCtx = {
    session, loading, permissions,
    can: (p) => can(permissions, p),
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? error.message : null
    },
    signInAnonymously: async (displayName) => {
      const { error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: displayName.slice(0, 60) } } })
      return error ? error.message : null
    },
    signOut: async () => { await supabase.auth.signOut() }
  }
  return <Auth.Provider value={value}>{children}</Auth.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Auth)
  if (!c) throw new Error('useAuth outside provider')
  return c
}

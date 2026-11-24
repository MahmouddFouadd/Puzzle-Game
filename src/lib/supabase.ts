import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anon)

// Missing config is reported in the UI (see App) rather than silently using fake data.
export const supabase = createClient(url ?? 'http://localhost', anon ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true }
})

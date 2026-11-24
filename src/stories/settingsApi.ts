import { supabase } from '../lib/supabase'
import { KEYS, type Overrides, type SettingKey, type SettingsValues } from './settings'

export async function loadSettings(storyId: string): Promise<{ defaults: SettingsValues; overrides: Partial<Overrides> | null }> {
  const d = await supabase.from('platform_settings').select('*').single()
  if (d.error || !d.data) throw new Error(d.error?.message ?? 'no defaults')
  const s = await supabase.from('story_settings').select('*').eq('story_id', storyId).maybeSingle()
  if (s.error) throw new Error(s.error.message)
  return { defaults: d.data as SettingsValues, overrides: (s.data as Partial<Overrides> | null) ?? null }
}
export async function saveSettings(storyId: string, row: Overrides): Promise<void> {
  const { error } = await supabase.from('story_settings').upsert({ story_id: storyId, ...row })
  if (error) throw new Error(error.message)
}
export const OVERRIDE_KEYS: readonly SettingKey[] = KEYS

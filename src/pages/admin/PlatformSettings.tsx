import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'

type Limits = { min_piece_count: number; max_piece_count: number; min_team_count: number; max_team_count: number; min_team_members: number; max_team_members: number }
const defaults: Limits = { min_piece_count: 4, max_piece_count: 100, min_team_count: 2, max_team_count: 12, min_team_members: 1, max_team_members: 12 }
export default function PlatformSettings() {
  const { t } = useI18n(); const [values, setValues] = useState<Limits>(defaults); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('')
  useEffect(() => { supabase.from('platform_settings').select('min_piece_count,max_piece_count,min_team_count,max_team_count,min_team_members,max_team_members').single().then(({ data, error: err }) => { if (err) setError(t('loadFailed')); else setValues({ ...defaults, ...(data as Limits) }); setLoading(false) }) }, [t])
  const set = (key: keyof Limits, value: string) => setValues((v) => ({ ...v, [key]: Math.max(1, Math.trunc(Number(value)) || 1) }))
  const save = async () => { setNotice(''); setError(''); if (values.max_piece_count < values.min_piece_count || values.max_team_count < values.min_team_count || values.max_team_members < values.min_team_members) { setError(t('limitsInvalid')); return } setSaving(true); const { error: err } = await supabase.from('platform_settings').update(values).eq('id', true); setSaving(false); if (err) setError(t('saveFailed')); else setNotice(t('saved')) }
  const fields: { key: keyof Limits; label: string }[] = [
    { key: 'min_piece_count', label: t('minPieceCount') }, { key: 'max_piece_count', label: t('maxPieceCount') },
    { key: 'min_team_count', label: t('minTeamCount') }, { key: 'max_team_count', label: t('maxTeamCount') },
    { key: 'min_team_members', label: t('minTeamMembers') }, { key: 'max_team_members', label: t('maxTeamMembers') }
  ]
  return <div className="max-w-3xl space-y-6"><div><h2 className="font-display text-3xl">{t('platformSettings')}</h2><p className="mt-1 opacity-70">{t('limitsHelp')}</p></div>{error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-ok">{notice}</p>}{loading ? <p role="status">{t('loading')}</p> : <section className="card grid gap-4 sm:grid-cols-2">{fields.map((f) => <label key={f.key} className="block"><span className="text-sm opacity-80">{f.label}</span><input className="input mt-1" type="number" min={1} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} /></label>)}<div className="sm:col-span-2"><button className="btn-primary" disabled={saving} onClick={() => void save()}>{saving ? t('saving') : t('save')}</button></div></section>}</div>
}

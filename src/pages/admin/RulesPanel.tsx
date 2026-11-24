import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n, type Key } from '../../lib/i18n'
import { getStory } from '../../stories/api'
import { errorKey } from '../../stories/errors'
import type { Story } from '../../stories/types'
import { effective, settingsProblems, toRow, type Policy, type SettingKey, type SettingsValues } from '../../stories/settings'
import { loadSettings, saveSettings } from '../../stories/settingsApi'
import { StoryTabs } from '../../components/StoryTabs'

type Field = { key: SettingKey; label: Key; kind: 'int' | 'bool' | 'policy' | 'time' }
const FIELDS: Field[] = [
  { key: 'points_correct_place', label: 'pointsCorrectPlace', kind: 'int' }, { key: 'points_wrong_place', label: 'pointsWrongPlace', kind: 'int' },
  { key: 'points_correct_discard', label: 'pointsCorrectDiscard', kind: 'int' }, { key: 'points_wrong_discard', label: 'pointsWrongDiscard', kind: 'int' },
  { key: 'points_wrong_answer', label: 'pointsWrongAnswer', kind: 'int' }, { key: 'wrong_answer_policy', label: 'wrongPolicy', kind: 'policy' },
  { key: 'max_attempts', label: 'maxAttempts', kind: 'int' }, { key: 'reveal_answer_after_fail', label: 'revealAnswer', kind: 'bool' },
  { key: 'card_time_limit_seconds', label: 'timeLimit', kind: 'time' }, { key: 'allow_multiple_questions_per_piece', label: 'multiPerPiece', kind: 'bool' },
  { key: 'allow_deck_recycling', label: 'recycling', kind: 'bool' }, { key: 'max_recycle_cycles', label: 'maxRecycle', kind: 'int' },
  { key: 'rescue_enabled', label: 'rescueEnabled', kind: 'bool' }, { key: 'max_rescue_draws', label: 'maxRescue', kind: 'int' },
  { key: 'rescue_cost_points', label: 'rescueCost', kind: 'int' }, { key: 'rescue_cards_repeatable', label: 'rescueRepeat', kind: 'bool' },
  { key: 'captain_grace_seconds', label: 'captainGrace', kind: 'int' }
]

export default function RulesPanel() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [story, setStory] = useState<Story | null>(null)
  const [defaults, setDefaults] = useState<SettingsValues | null>(null)
  const [vals, setVals] = useState<SettingsValues | null>(null)
  const [custom, setCustom] = useState<ReadonlySet<SettingKey>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fail = useCallback((e: unknown) => { setNotice(null); setError(t(errorKey(e))) }, [t])
  const reload = useCallback(async () => {
    if (!id) return
    const [s, { defaults: d, overrides }] = await Promise.all([getStory(id), loadSettings(id)])
    setStory(s); setDefaults(d); setVals(effective(d, overrides))
    setCustom(new Set((Object.keys(overrides ?? {}) as SettingKey[]).filter((k) => overrides?.[k] !== null && overrides?.[k] !== undefined && k !== ('story_id' as SettingKey))))
  }, [id])
  useEffect(() => { reload().catch(fail) }, [reload, fail])

  const locked = story?.status === 'PUBLISHED'
  const toggle = (k: SettingKey) => setCustom((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const setVal = <K extends SettingKey>(k: K, v: SettingsValues[K]) => setVals((x) => (x ? { ...x, [k]: v } : x))

  const save = async () => {
    if (!id || !vals) return
    setError(null); setNotice(null)
    if (settingsProblems(vals, custom).length > 0) { setError(t('errSettings')); return }
    try { await saveSettings(id, toRow(vals, custom)); setNotice(t('saved')); await reload() } catch (e) { fail(e) }
  }

  if (!id) return null
  const show = (k: SettingKey, v: SettingsValues[SettingKey]) => (k === 'card_time_limit_seconds' ? (v === null ? '∞' : String(v)) : typeof v === 'boolean' ? (v ? '✓' : '✗') : String(v))

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/admin/stories" className="underline text-gold-400">{t('back')}</Link>
      <h2 className="font-display text-3xl">{story?.title}</h2>
      <StoryTabs storyId={id} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-ok">{notice}</p>}
      {!vals || !defaults ? <p role="status">{t('loading')}</p> : (
        <section className="card space-y-3">
          {FIELDS.map((f) => {
            const on = custom.has(f.key)
            const disabled = locked || !on
            return (
              <div key={f.key} className="grid gap-2 sm:grid-cols-[1fr_auto_10rem] items-center">
                <span>{t(f.label)}</span>
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={!on} disabled={locked} onChange={() => toggle(f.key)} />
                  {t('useDefault')} ({show(f.key, defaults[f.key])})
                </label>
                {f.kind === 'int' && <input className="input" type="number" aria-label={t(f.label)} disabled={disabled} value={vals[f.key] as number}
                  onChange={(e) => setVal(f.key as 'max_attempts', Math.trunc(Number(e.target.value)))} />}
                {f.kind === 'time' && <input className="input" type="number" min={0} aria-label={t(f.label)} disabled={disabled} value={vals.card_time_limit_seconds ?? 0}
                  onChange={(e) => setVal('card_time_limit_seconds', Math.trunc(Number(e.target.value)))} />}
                {f.kind === 'bool' && <input type="checkbox" aria-label={t(f.label)} disabled={disabled} checked={vals[f.key] as boolean}
                  onChange={(e) => setVal(f.key as 'allow_deck_recycling', e.target.checked)} />}
                {f.kind === 'policy' && (
                  <select className="input" aria-label={t(f.label)} disabled={disabled} value={vals.wrong_answer_policy} onChange={(e) => setVal('wrong_answer_policy', e.target.value as Policy)}>
                    <option value="MINUS">{t('policyMinus')}</option><option value="RETRY">{t('policyRetry')}</option><option value="SKIP">{t('policySkip')}</option>
                  </select>
                )}
              </div>
            )
          })}
          <p className="text-sm opacity-70">{t('timeHelp')}</p>
          <button className="btn-primary" type="button" disabled={locked} onClick={() => void save()}>{t('save')}</button>
        </section>
      )}
    </div>
  )
}

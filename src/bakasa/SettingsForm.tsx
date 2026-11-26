import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { listCategories, type BakasaCategory, type BakasaSettings } from './api'

function Stepper({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="bk-icon-btn" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <span className="w-16 text-center font-display text-xl" aria-live="polite">{value}{suffix}</span>
        <button type="button" className="bk-icon-btn" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-6 w-6 accent-[#ffb938]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function useCategories() {
  const [cats, setCats] = useState<BakasaCategory[] | null>(null)
  useEffect(() => { listCategories().then(setCats).catch(() => setCats([])) }, [])
  return cats
}

export function SettingsForm({ value, onChange }: { value: BakasaSettings; onChange: (s: BakasaSettings) => void }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const cats = useCategories()
  const set = <K extends keyof BakasaSettings>(k: K, v: BakasaSettings[K]) => onChange({ ...value, [k]: v })
  const toggleCat = (id: string) => set('category_ids', value.category_ids.includes(id) ? value.category_ids.filter((c) => c !== id) : [...value.category_ids, id])
  const maxSpies = Math.max(1, Math.floor((value.max_players - 1) / 2))
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="font-semibold text-bk-accent">{ar ? 'الفئات' : 'Categories'}</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => set('category_ids', [])} aria-pressed={value.category_ids.length === 0}
            className={`bk-chip border-2 ${value.category_ids.length === 0 ? 'border-bk-accent bg-bk-accent/20' : 'border-white/15'}`}>🎲 {ar ? 'عشوائي من الكل' : 'Random – all'}</button>
          {cats === null && <span className="text-sm opacity-60">{ar ? 'جارٍ التحميل…' : 'Loading…'}</span>}
          {cats?.map((c) => {
            const on = value.category_ids.includes(c.id)
            return <button key={c.id} type="button" onClick={() => toggleCat(c.id)} aria-pressed={on}
              className="bk-chip border-2 transition" style={{ borderColor: on ? c.color : 'rgba(255,255,255,.15)', background: on ? `${c.color}33` : undefined }}>
              {c.emoji} {ar ? c.name_ar : c.name_en}</button>
          })}
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold text-bk-accent">{ar ? 'اللاعبين والجولات' : 'Players & rounds'}</h3>
        <Stepper label={ar ? 'عدد البِكس' : 'Spies'} value={Math.min(value.spies, maxSpies)} min={1} max={Math.min(3, maxSpies)} onChange={(v) => set('spies', v)} />
        <Stepper label={ar ? 'عدد الجولات' : 'Rounds'} value={value.rounds} min={1} max={10} onChange={(v) => set('rounds', v)} />
        <Stepper label={ar ? 'أقل عدد لاعبين' : 'Min players'} value={value.min_players} min={3} max={value.max_players} onChange={(v) => set('min_players', v)} />
        <Stepper label={ar ? 'أكبر عدد لاعبين' : 'Max players'} value={value.max_players} min={Math.max(3, value.min_players)} max={20} onChange={(v) => set('max_players', v)} />
      </section>
      <details className="rounded-2xl border border-white/10 p-4">
        <summary className="cursor-pointer font-semibold text-bk-accent">{ar ? 'إعدادات متقدمة (الوقت والتصويت)' : 'Advanced (timers & voting)'}</summary>
        <div className="mt-4 space-y-3">
          <Stepper label={ar ? 'لفّات التلميحات' : 'Clue laps'} value={value.clue_laps} min={1} max={4} onChange={(v) => set('clue_laps', v)} />
          <Stepper label={ar ? 'وقت كل دور' : 'Turn time'} value={value.turn_seconds} min={15} max={180} step={15} suffix={ar ? 'ث' : 's'} onChange={(v) => set('turn_seconds', v)} />
          <Stepper label={ar ? 'وقت النقاش' : 'Discussion'} value={value.discussion_seconds / 60} min={1} max={20} suffix={ar ? 'د' : 'm'} onChange={(v) => set('discussion_seconds', v * 60)} />
          <Stepper label={ar ? 'وقت التصويت' : 'Voting time'} value={value.voting_seconds} min={20} max={300} step={10} suffix={ar ? 'ث' : 's'} onChange={(v) => set('voting_seconds', v)} />
          <Toggle label={ar ? 'فرصة أخيرة للبِكس يخمّن الكلمة' : 'Spy final guess'} checked={value.final_guess} onChange={(v) => set('final_guess', v)} />
          {value.final_guess && <Stepper label={ar ? 'وقت التخمين' : 'Guess time'} value={value.guess_seconds} min={10} max={120} step={5} suffix={ar ? 'ث' : 's'} onChange={(v) => set('guess_seconds', v)} />}
          <Toggle label={ar ? 'مسموح تغيير الصوت قبل القفل' : 'Allow changing votes'} checked={value.allow_vote_change} onChange={(v) => set('allow_vote_change', v)} />
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{ar ? 'لو حصل تعادل' : 'On a tie'}</span>
            <select className="bk-input w-auto py-2 text-sm" value={value.tie_rule} onChange={(e) => set('tie_rule', e.target.value as BakasaSettings['tie_rule'])}>
              <option value="REVOTE">{ar ? 'إعادة تصويت مرة' : 'Revote once'}</option>
              <option value="SPY_WINS">{ar ? 'البِكس يكسب' : 'Spy wins'}</option>
            </select>
          </label>
        </div>
      </details>
    </div>
  )
}

export function SettingsSummary({ s }: { s: BakasaSettings }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const cats = useCategories()
  const names = s.category_ids.length === 0 ? (ar ? 'كل الفئات' : 'All categories')
    : (cats ?? []).filter((c) => s.category_ids.includes(c.id)).map((c) => `${c.emoji} ${ar ? c.name_ar : c.name_en}`).join('، ')
  const items: [string, string][] = [
    ['🕵️', ar ? `${s.spies} بِكس` : `${s.spies} spy`], ['🔁', ar ? `${s.rounds} جولات` : `${s.rounds} rounds`],
    ['👥', `${s.min_players}–${s.max_players}`], ['💬', ar ? `${s.clue_laps} لفّة × ${s.turn_seconds}ث` : `${s.clue_laps} laps × ${s.turn_seconds}s`],
    ['🗳️', `${s.voting_seconds}${ar ? 'ث' : 's'}`], ['🎯', s.final_guess ? (ar ? 'تخمين أخير' : 'Final guess') : (ar ? 'بدون تخمين' : 'No guess')]
  ]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">{items.map(([i, t]) => <span key={i} className="bk-chip bg-white/10">{i} {t}</span>)}</div>
      <p className="text-sm opacity-75">🗂️ {names}</p>
    </div>
  )
}

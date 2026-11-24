import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../lib/i18n'
import { listCategories, saveCategory, type ContentCategory } from '../../content/api'

const empty = { id: undefined as string | undefined, slug: '', name_en: '', name_ar: '', sort_order: 0, is_active: true }

export default function ContentCategories() {
  const { t } = useI18n()
  const [rows, setRows] = useState<ContentCategory[]>([])
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reload = useCallback(async () => {
    try { setRows(await listCategories()) } catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
  }, [t])
  useEffect(() => { void reload() }, [reload])
  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => setForm((old) => ({ ...old, [key]: value }))
  const edit = (row: ContentCategory) => setForm({ id: row.id, slug: row.slug, name_en: row.name_en, name_ar: row.name_ar, sort_order: row.sort_order, is_active: row.is_active })
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { await saveCategory(form); setNotice(t('categorySaved')); setForm(empty); await reload() }
    catch (e) { setError(e instanceof Error ? e.message : t('errGeneric')) }
    finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
      <section className="card space-y-3">
        <h3 className="font-display text-2xl">{t('contentCategories')}</h3>
        {rows.length === 0 ? <p className="opacity-70">{t('noCategories')}</p> : <ul className="space-y-2">{rows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-700/60 p-3"><div><p className="font-semibold">{row.name_ar} · {row.name_en}</p><p className="text-xs opacity-70">{row.slug} · {row.is_active ? t('status') : t('reviewArchived')}</p></div><button className="btn-ghost" type="button" onClick={() => edit(row)}>{t('edit')}</button></li>)}</ul>}
      </section>
      <form className="card h-fit space-y-3" onSubmit={(e) => void submit(e)}>
        <h3 className="font-display text-2xl">{form.id ? t('edit') : t('addCategory')}</h3>
        <label>{t('categorySlug')}<input className="input mt-1" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(e) => set('slug', e.target.value)} /></label>
        <label>{t('categoryNameEnglish')}<input className="input mt-1" required maxLength={80} value={form.name_en} onChange={(e) => set('name_en', e.target.value)} /></label>
        <label>{t('categoryNameArabic')}<input className="input mt-1" required maxLength={80} value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} dir="rtl" /></label>
        <label>{t('position')}<input className="input mt-1" type="number" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} /></label>
        {form.id && <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />{t('status')}</label>}
        {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-ok">{notice}</p>}
        <div className="flex gap-2"><button className="btn-primary" type="submit" disabled={busy}>{busy ? t('saving') : t('save')}</button>{form.id && <button className="btn-ghost" type="button" onClick={() => setForm(empty)}>{t('cancel')}</button>}</div>
      </form>
    </div>
  )
}

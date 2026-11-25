import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { listDetectiveCases, startDetectiveSession, type DetectiveCase } from '../detective/api'

export default function DetectiveCatalog() {
  const { lang } = useI18n()
  const nav = useNavigate()
  const [cases, setCases] = useState<DetectiveCase[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => { listDetectiveCases().then(setCases).catch((e: Error) => setError(e.message)) }, [])
  const begin = async (id: string) => {
    setBusy(id); setError('')
    try { nav(`/detective/session/${await startDetectiveSession(id)}`) } catch (e) { setError((e as Error).message); setBusy('') }
  }
  return <main className="min-h-screen bg-ink-900 p-4 md:p-10">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="dashboard-hero overflow-hidden rounded-card border border-parchment-200/15 p-6 md:p-10">
        <p className="text-sm uppercase tracking-[.25em] text-gold-400">Detective Mode</p>
        <h1 className="mt-2 font-display text-4xl text-parchment-50">{lang === 'ar' ? 'وضع المحقق' : 'Detective Mode'}</h1>
        <p className="mt-3 max-w-2xl text-parchment-100/75">{lang === 'ar' ? 'اكتشف الأدلة، اربط الأحداث، وابنِ استنتاجك خطوة بخطوة.' : 'Discover evidence, connect events, and build your conclusion step by step.'}</p>
      </header>
      {error && <p className="card text-danger" role="alert">{error}</p>}
      {cases === null ? <p role="status">{lang === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p> : cases.length === 0 ? <p className="card">{lang === 'ar' ? 'لا توجد قضايا منشورة بعد.' : 'No published cases yet.'}</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {cases.map((item) => <article key={item.id} className="card space-y-4">
            <div><p className="text-xs uppercase tracking-widest text-gold-400">{item.case_type} · {item.difficulty}/5</p><h2 className="mt-1 font-display text-2xl">{lang === 'ar' ? item.title_ar : item.title}</h2><p className="mt-2 text-sm opacity-75">{lang === 'ar' ? item.description_ar : item.description}</p></div>
            <div className="flex gap-2"><button className="btn-primary" disabled={busy === item.id} onClick={() => void begin(item.id)}>{busy === item.id ? '…' : (lang === 'ar' ? 'ابدأ التحقيق' : 'Start investigation')}</button><Link className="btn-ghost" to="/">{lang === 'ar' ? 'الرئيسية' : 'Home'}</Link></div>
          </article>)}
        </div>
      )}
    </div>
  </main>
}

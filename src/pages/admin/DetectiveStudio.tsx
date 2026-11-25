import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { createDetectiveCase, listAdminDetectiveCases, type DetectiveCase } from '../../detective/api'

export default function DetectiveStudio() {
  const { session } = useAuth()
  const [items, setItems] = useState<DetectiveCase[] | null>(null)
  const [title, setTitle] = useState('')
  const [titleAr, setTitleAr] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => listAdminDetectiveCases().then(setItems).catch((e: Error) => setError(e.message))
  useEffect(() => { void load() }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!session || !title.trim() || !titleAr.trim()) return
    setBusy(true); setError('')
    try { await createDetectiveCase(title.trim(), titleAr.trim(), session.user.id); setTitle(''); setTitleAr(''); await load() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <div className="space-y-5"><header><p className="text-xs uppercase tracking-[.25em] text-gold-400">Detective Mode</p><h1 className="font-display text-3xl">Detective Studio</h1><p className="mt-2 max-w-2xl opacity-75">Build versioned cases, scenes, normalized hotspots, clues, questions and solutions without changing the existing story builder.</p></header>
    <form onSubmit={submit} className="card grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Case title (English)" maxLength={160} required /><input className="input" dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder="عنوان القضية (العربية)" maxLength={160} required /><button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'New case'}</button></form>
    {error && <p className="text-danger" role="alert">{error}</p>}
    {items === null ? <p role="status">Loading…</p> : <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <Link key={item.id} to={`/admin/detective/${item.id}`} className="card block hover:border-gold-400"><p className="text-xs uppercase tracking-widest text-gold-400">{item.status} · {item.case_type}</p><h2 className="mt-1 font-display text-2xl">{item.title}</h2><p dir="rtl" className="mt-1 text-lg">{item.title_ar}</p><p className="mt-2 text-sm opacity-70">Difficulty {item.difficulty}/5</p></Link>)}</div>}
  </div>
}

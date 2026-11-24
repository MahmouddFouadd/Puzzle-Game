import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useI18n } from '../../lib/i18n'
import { createStory, listStories } from '../../stories/api'
import { errorKey } from '../../stories/errors'
import type { Story } from '../../stories/types'

export default function Stories() {
  const { t } = useI18n()
  const { session } = useAuth()
  const nav = useNavigate()
  const [stories, setStories] = useState<Story[] | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listStories().then(setStories).catch((e) => { setError(t(errorKey(e))); setStories([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !title.trim()) return
    setBusy(true); setError(null)
    try { const s = await createStory(title.trim(), session.user.id); nav(`/admin/stories/${s.id}`) }
    catch (err) { setError(t(errorKey(err))); setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-3xl">{t('stories')}</h2>
      <form onSubmit={submit} className="card flex gap-2 flex-wrap">
        <input className="input flex-1 min-w-[12rem]" placeholder={t('storyTitle')} aria-label={t('storyTitle')} maxLength={120}
          value={title} onChange={(e) => setTitle(e.target.value)} required />
        <button className="btn-primary" disabled={busy} type="submit">{t('create')}</button>
      </form>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {stories === null ? <p role="status">{t('loading')}</p> : stories.length === 0 ? <p className="opacity-70">{t('noStories')}</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {stories.map((s) => (
            <li key={s.id}>
              <Link to={`/admin/stories/${s.id}`} className="card block hover:border-gold-500">
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm opacity-70">{s.status} · {s.language.toUpperCase()}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

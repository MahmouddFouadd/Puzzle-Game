import { useEffect, useState } from 'react'
import { listSelectableStories, hostError, type StoryCard } from './api'

const GRADIENTS = ['linear-gradient(150deg,#3b5bff,#1f7a8c)', 'linear-gradient(150deg,#ff8a3d,#c2410c)', 'linear-gradient(150deg,#7c3aed,#db2777)',
  'linear-gradient(150deg,#0f766e,#14b8a6)', 'linear-gradient(150deg,#b45309,#f59e0b)', 'linear-gradient(150deg,#1e293b,#475569)']
const tone = (id: string) => GRADIENTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length]

/** Title cards only: the server sends id, title and an approved cover; there is no story content to show. */
export function StoryPicker({ ar, value, onChange }: { ar: boolean; value: string | null; onChange: (s: StoryCard) => void }) {
  const [items, setItems] = useState<StoryCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { listSelectableStories().then(setItems).catch((e) => setError(hostError(e, ar))) }, [ar])
  if (error) return <p role="alert" className="text-danger">{error}</p>
  if (!items) return <p role="status" className="opacity-70">{ar ? 'بنجيب القصص…' : 'Loading stories…'}</p>
  if (items.length === 0) return <p className="card text-center">{ar ? 'مفيش قصص متاحة للغرف دلوقتي.' : 'No stories are available for rooms right now.'}</p>
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={ar ? 'اختار القصة' : 'Choose a story'}>
      {items.map((s) => {
        const on = s.id === value
        return (
          <li key={s.id}>
            <button type="button" role="radio" aria-checked={on} onClick={() => onChange(s)}
              className={`group relative block w-full overflow-hidden rounded-2xl border-2 text-start shadow-lg transition ${on ? 'scale-[1.02] border-gold-400 ring-4 ring-gold-400/30' : 'border-white/10 hover:border-white/30'}`}>
              <div className="relative aspect-[3/4] w-full" style={{ background: tone(s.id) }}>
                {s.cover_url && <img src={s.cover_url.startsWith('http') ? s.cover_url : `/${s.cover_url}`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
                  onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                {!s.cover_url && <span className="absolute inset-0 grid place-items-center text-6xl opacity-30" aria-hidden="true">📖</span>}
                <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" aria-hidden="true" />
                <h3 className="absolute inset-x-0 bottom-0 p-3 font-display text-lg font-bold leading-snug text-white" dir={s.language === 'ar' ? 'rtl' : 'ltr'}>{s.title}</h3>
                {on && <span className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-gold-400 font-bold text-ink-900">✓</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

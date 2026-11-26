import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'

interface Word { id: string; word_ar: string; word_en: string; active: boolean }
interface Cat { id: string; key: string; name_ar: string; name_en: string; emoji: string; color: string; active: boolean; position: number; words: Word[] }

/** Bakasa content: categories and secret words. Writes go through table RLS (story.manage). */
export default function BakasaAdmin() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [newWord, setNewWord] = useState({ ar: '', en: '' })
  const [newCat, setNewCat] = useState({ key: '', name_ar: '', name_en: '', emoji: '🎯', color: '#7c5cff' })
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('bakasa_admin_categories')
    if (e) setError(e.message); else setCats(data as Cat[])
  }, [])
  useEffect(() => { void load() }, [load])
  const act = async (p: PromiseLike<{ error: { message: string } | null }>) => { setError(null); const { error: e } = await p; if (e) setError(e.message); await load() }

  const addWord = (e: FormEvent, cat: string) => {
    e.preventDefault()
    if (!newWord.ar.trim()) return
    void act(supabase.from('bakasa_words').insert({ category_id: cat, word_ar: newWord.ar.trim(), word_en: newWord.en.trim() })).then(() => setNewWord({ ar: '', en: '' }))
  }
  const addCat = (e: FormEvent) => {
    e.preventDefault()
    if (!/^[a-z0-9_]+$/.test(newCat.key) || !newCat.name_ar.trim()) { setError(ar ? 'المفتاح لازم يكون حروف إنجليزي صغيرة/أرقام/_ والاسم العربي مطلوب.' : 'Key must be a-z, 0-9 or _; Arabic name required.'); return }
    void act(supabase.from('bakasa_categories').insert({ ...newCat, name_en: newCat.name_en || newCat.name_ar, position: (cats?.length ?? 0) + 1 }))
      .then(() => setNewCat({ key: '', name_ar: '', name_en: '', emoji: '🎯', color: '#7c5cff' }))
  }

  return (
    <div className="space-y-6">
      <header><h1 className="font-display text-3xl text-gold-400">🕵️ {ar ? 'بكاسة – الفئات والكلمات' : 'Bakasa – categories & words'}</h1>
        <p className="opacity-75">{ar ? 'الكلمات السرية اللي بتتوزع في الجولات. الكلمات المتوقفة مش بتظهر في اللعب.' : 'Secret words dealt in rounds. Inactive words are never dealt.'}</p></header>
      {error && <p role="alert" className="card text-danger">{error}</p>}
      {cats === null && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {cats?.map((c) => (
          <section key={c.id} className="card space-y-3" style={{ borderColor: `${c.color}88` }}>
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="text-start" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                <span className="text-2xl">{c.emoji}</span> <b>{ar ? c.name_ar : c.name_en}</b> <span className="text-sm opacity-70">({c.words.filter((w) => w.active).length}/{c.words.length})</span>
              </button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.active} onChange={() => void act(supabase.from('bakasa_categories').update({ active: !c.active }).eq('id', c.id))} />{ar ? 'مفعّلة' : 'Active'}</label>
            </div>
            {open === c.id && (
              <div className="space-y-3">
                <ul className="flex flex-wrap gap-2">{c.words.map((w) => (
                  <li key={w.id}><button type="button" title={ar ? 'تفعيل/إيقاف' : 'Toggle'} onClick={() => void act(supabase.from('bakasa_words').update({ active: !w.active }).eq('id', w.id))}
                    className={`rounded-full border px-3 py-1 text-sm ${w.active ? 'border-gold-400/50' : 'border-parchment-200/20 line-through opacity-50'}`}>{w.word_ar}{w.word_en ? ` · ${w.word_en}` : ''}</button></li>))}</ul>
                <form className="flex flex-wrap gap-2" onSubmit={(e) => addWord(e, c.id)}>
                  <input className="input flex-1" placeholder={ar ? 'كلمة بالعربي' : 'Arabic word'} maxLength={60} value={newWord.ar} onChange={(e) => setNewWord({ ...newWord, ar: e.target.value })} />
                  <input className="input flex-1" placeholder={ar ? 'بالإنجليزي (اختياري)' : 'English (optional)'} maxLength={60} value={newWord.en} onChange={(e) => setNewWord({ ...newWord, en: e.target.value })} />
                  <button className="btn-primary" type="submit">{ar ? 'إضافة' : 'Add'}</button>
                </form>
              </div>
            )}
          </section>
        ))}
      </div>
      <form className="card space-y-3" onSubmit={addCat}>
        <h2 className="font-semibold">{ar ? 'فئة جديدة' : 'New category'}</h2>
        <div className="grid gap-2 md:grid-cols-5">
          <input className="input" placeholder="key (e.g. cartoons)" dir="ltr" value={newCat.key} onChange={(e) => setNewCat({ ...newCat, key: e.target.value.toLowerCase() })} />
          <input className="input" placeholder={ar ? 'الاسم بالعربي' : 'Arabic name'} value={newCat.name_ar} onChange={(e) => setNewCat({ ...newCat, name_ar: e.target.value })} />
          <input className="input" placeholder={ar ? 'الاسم بالإنجليزي' : 'English name'} value={newCat.name_en} onChange={(e) => setNewCat({ ...newCat, name_en: e.target.value })} />
          <input className="input" aria-label="emoji" value={newCat.emoji} maxLength={4} onChange={(e) => setNewCat({ ...newCat, emoji: e.target.value })} />
          <input className="input h-11" type="color" aria-label={ar ? 'اللون' : 'Color'} value={newCat.color} onChange={(e) => setNewCat({ ...newCat, color: e.target.value })} />
        </div>
        <button className="btn-primary" type="submit">{ar ? 'إضافة فئة' : 'Add category'}</button>
      </form>
    </div>
  )
}

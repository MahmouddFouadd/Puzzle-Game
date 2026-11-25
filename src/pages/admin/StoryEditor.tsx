import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import {
  deleteImage, generateAndSave, getStory, listImages, pieceCounts, reorderImages, signedOriginalUrl,
  updateImage, updateStory, uploadImage
} from '../../stories/api'
import { errorKey, isMappingsConflict } from '../../stories/errors'
import type { Story, StoryImage } from '../../stories/types'
import { generatePuzzle } from '../../puzzle/engine'
import { StoryTabs } from '../../components/StoryTabs'
import { PuzzlePreview } from '../../puzzle/PuzzlePreview'
import { supabase } from '../../lib/supabase'

interface PieceLimits { min: number; max: number }
const defaultPieceLimits: PieceLimits = { min: 4, max: 100 }

interface CardProps {
  image: StoryImage; url: string | undefined; saved: number; first: boolean; last: boolean; locked: boolean; limits: PieceLimits
  progress: string | undefined
  onMeta: (id: string, patch: { title: string; description: string; hint: string }) => void
  onMove: (id: string, dir: -1 | 1) => void
  onDelete: (img: StoryImage) => void
  onGenerate: (img: StoryImage, count: number, seed: number) => void
  onImageError: (id: string) => void
  onImageLoad: (id: string) => void
}

function ImageCard({ image, url, saved, first, last, locked, progress, limits, onMeta, onMove, onDelete, onGenerate, onImageError, onImageLoad }: CardProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(image.title)
  const [description, setDescription] = useState(image.description ?? '')
  const [hint, setHint] = useState(image.hint ?? '')
  const [count, setCount] = useState(image.piece_count)
  const [seed, setSeed] = useState(image.puzzle_seed)
  const [showPreview, setShowPreview] = useState(false)
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set())
  const layout = useMemo(() => (showPreview ? generatePuzzle({ width: image.width, height: image.height, pieceCount: count, seed }) : null), [showPreview, image.width, image.height, count, seed])
  const commit = () => onMeta(image.id, { title: title.trim() || image.title, description, hint })
  useEffect(() => { setCount(image.piece_count); setSeed(image.puzzle_seed) }, [image.piece_count, image.puzzle_seed])

  return (
    <li className="card space-y-3">
      <div className="flex gap-3">
        {url ? <img src={url} alt={image.title} onError={() => onImageError(image.id)} onLoad={() => onImageLoad(image.id)} className="w-24 h-24 object-cover rounded-xl" /> : <div className="grid w-24 h-24 place-items-center rounded-xl bg-ink-700 text-center text-xs">{t('imageUnavailable')}</div>}
        <div className="flex-1 space-y-2">
          <div className="text-sm opacity-70">{t('position')} {image.position} · {image.width}×{image.height}</div>
          <input className="input" aria-label={t('imageTitle')} placeholder={t('imageTitle')} maxLength={80} value={title}
            onChange={(e) => setTitle(e.target.value)} onBlur={commit} disabled={locked} />
        </div>
      </div>
      <textarea className="input" rows={2} aria-label={t('description')} placeholder={t('description')} value={description}
        onChange={(e) => setDescription(e.target.value)} onBlur={commit} disabled={locked} />
      <textarea className="input" rows={2} aria-label={t('hint')} placeholder={t('hint')} value={hint}
        onChange={(e) => setHint(e.target.value)} onBlur={commit} disabled={locked} />
      <div className="flex flex-wrap gap-2 items-end">
        <label className="block text-sm">{t('pieceCount')}
          <input className="input mt-1 w-24" type="number" min={limits.min} max={limits.max} value={count} disabled={locked}
            onChange={(e) => setCount(Math.min(limits.max, Math.max(limits.min, Math.floor(Number(e.target.value)) || limits.min)))} />
        </label>
        <label className="block text-sm">{t('seed')}
          <input className="input mt-1 w-32" type="number" value={seed} disabled={locked} onChange={(e) => setSeed(Math.floor(Number(e.target.value)) || 0)} />
        </label>
        <button className="btn-ghost" type="button" disabled={locked} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>{t('randomize')}</button>
        <button className="btn-primary" type="button" disabled={locked || !!progress} onClick={() => onGenerate(image, count, seed)}>
          {progress ? `${t('generating')} ${progress}` : t('generatePieces')}
        </button>
      </div>
      <p className="text-sm opacity-80">{saved > 0 ? `${saved} ${t('piecesSaved')}` : t('noPieces')}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" type="button" disabled={first || locked} onClick={() => onMove(image.id, -1)}>{t('moveUp')}</button>
        <button className="btn-ghost" type="button" disabled={last || locked} onClick={() => onMove(image.id, 1)}>{t('moveDown')}</button>
        <button className="btn-ghost" type="button" onClick={() => setShowPreview((v) => !v)}>{t('previewLabel')}</button>
        <button className="btn-ghost text-danger" type="button" disabled={locked} onClick={() => onDelete(image)}>{t('deleteLabel')}</button>
      </div>
      {layout && url && (
        <PuzzlePreview imageUrl={url} width={image.width} height={image.height} layout={layout} revealed={revealed} showOutlines selected={null}
          onImageError={() => onImageError(image.id)} onImageLoad={() => onImageLoad(image.id)}
          onPieceClick={(i) => setRevealed((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
      )}
    </li>
  )
}

export default function StoryEditor() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [story, setStory] = useState<Story | null>(null)
  const [images, setImages] = useState<StoryImage[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [failedUploads, setFailedUploads] = useState<File[]>([])
  const retryingImageUrls = useRef(new Set<string>())
  const [form, setForm] = useState({ title: '', description: '', category: '', subject: '', difficulty: 1, language: 'en' as 'en' | 'ar' })
  const [pieceLimits, setPieceLimits] = useState<PieceLimits>(defaultPieceLimits)

  const fail = useCallback((e: unknown) => { setNotice(null); setError(t(errorKey(e))) }, [t])

  const reload = useCallback(async () => {
    if (!id) return
    const [s, imgs] = await Promise.all([getStory(id), listImages(id)])
    setStory(s)
    setForm({ title: s.title, description: s.description ?? '', category: s.category ?? '', subject: s.subject ?? '', difficulty: s.difficulty, language: s.language })
    setImages(imgs)
    setCounts(await pieceCounts(imgs.map((i) => i.id)))
    const entries = await Promise.all(imgs.map(async (i) => {
      try { return [i.id, await signedOriginalUrl(i.storage_path)] as const }
      catch { return [i.id, ''] as const }
    }))
    setUrls(Object.fromEntries(entries))
  }, [id])

  useEffect(() => { reload().catch(fail) }, [reload, fail])
  useEffect(() => {
    supabase.from('platform_settings').select('min_piece_count,max_piece_count').single().then(({ data }) => {
      if (!data) return
      const min = Math.max(1, Number(data.min_piece_count) || defaultPieceLimits.min)
      const max = Math.max(min, Number(data.max_piece_count) || defaultPieceLimits.max)
      setPieceLimits({ min, max })
    })
  }, [])

  const locked = story?.status === 'PUBLISHED'

  const saveInfo = async () => {
    if (!id) return
    setError(null)
    try {
      await updateStory(id, { title: form.title.trim(), description: form.description || null, category: form.category || null, subject: form.subject || null, difficulty: form.difficulty, language: form.language })
      setNotice(t('saved'))
    } catch (e) { fail(e) }
  }

  const processUploads = async (files: File[]) => {
    if (!id || !files.length) return
    setUploading(true); setError(null); setNotice(null); setUploadProgress(`0/${files.length}`)
    const failed: File[] = []
    let pos = Math.max(0, ...images.map((image) => image.position)) + 1
    try {
      for (let index = 0; index < files.length; index++) {
        try { await uploadImage(id, files[index], pos); pos++ }
        catch (err) { failed.push(files[index]); setError((previous) => [previous, `${files[index].name}: ${t(errorKey(err))}`].filter(Boolean).join('\n')) }
        setUploadProgress(`${index + 1}/${files.length}`)
      }
      setFailedUploads(failed)
      if (!failed.length) setNotice(t('uploadComplete'))
      await reload().catch(fail)
    } finally { setUploading(false); setUploadProgress(null) }
  }

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await processUploads(files)
  }

  const retryUploads = () => { if (failedUploads.length) void processUploads(failedUploads) }

  const onImageError = useCallback(async (imageId: string) => {
    if (retryingImageUrls.current.has(imageId)) return
    retryingImageUrls.current.add(imageId)
    const image = images.find((item) => item.id === imageId)
    if (!image) return
    try {
      const url = await signedOriginalUrl(image.storage_path)
      setUrls((previous) => ({ ...previous, [imageId]: url }))
    }
    catch { setUrls((previous) => ({ ...previous, [imageId]: '' })) }
  }, [images])

  const onImageLoad = useCallback((imageId: string) => { retryingImageUrls.current.delete(imageId) }, [])

  const onMeta = async (imgId: string, patch: { title: string; description: string; hint: string }) => {
    try { await updateImage(imgId, { title: patch.title, description: patch.description || null, hint: patch.hint || null }) } catch (e) { fail(e) }
  }

  const onMove = async (imgId: string, dir: -1 | 1) => {
    if (!id) return
    const ids = images.map((i) => i.id)
    const from = ids.indexOf(imgId), to = from + dir
    if (to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    try { await reorderImages(id, ids); await reload() } catch (e) { fail(e) }
  }

  const onDelete = async (img: StoryImage) => {
    if (!window.confirm(t('confirmDelete'))) return
    try { await deleteImage(img); await reload() } catch (e) { fail(e) }
  }

  const onGenerate = async (img: StoryImage, count: number, seed: number) => {
    setError(null); setNotice(null)
    const run = async (force: boolean) => generateAndSave(img, count, seed, force, (d, n) => setProgress((p) => ({ ...p, [img.id]: `${d}/${n}` })))
    try {
      try { await run(false) }
      catch (e) {
        if (!isMappingsConflict(e) || !window.confirm(t('confirmMappings'))) throw e
        await run(true)
      }
      await reload()
    } catch (e) { fail(e) }
    setProgress((p) => { const n = { ...p }; delete n[img.id]; return n })
  }

  if (!story) return error ? <p role="alert" className="text-danger">{error}</p> : <p role="status">{t('loading')}</p>
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/admin/stories" className="underline text-gold-400">{t('back')}</Link>
      <h2 className="font-display text-3xl">{story.title} <span className="text-base opacity-60">{story.status}</span></h2>
      <StoryTabs storyId={story.id} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-ok">{notice}</p>}

      <section className="card grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">{t('storyTitle')}<input className="input mt-1" maxLength={120} value={form.title} disabled={locked} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="block sm:col-span-2">{t('description')}<textarea className="input mt-1" rows={3} value={form.description} disabled={locked} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="block">{t('category')}<input className="input mt-1" value={form.category} disabled={locked} onChange={(e) => set('category', e.target.value)} /></label>
        <label className="block">{t('subject')}<input className="input mt-1" value={form.subject} disabled={locked} onChange={(e) => set('subject', e.target.value)} /></label>
        <label className="block">{t('difficulty')}
          <select className="input mt-1" value={form.difficulty} disabled={locked} onChange={(e) => set('difficulty', Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="block">{t('languageLabel')}
          <select className="input mt-1" value={form.language} disabled={locked} onChange={(e) => set('language', e.target.value as 'en' | 'ar')}>
            <option value="en">English</option><option value="ar">العربية</option>
          </select>
        </label>
        <div className="sm:col-span-2"><button className="btn-primary" type="button" disabled={locked || !form.title.trim()} onClick={() => void saveInfo()}>{t('save')}</button></div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-2xl">{t('images')}</h3>
        <label className="btn-ghost cursor-pointer">
          {uploading ? `${t('uploading')} ${uploadProgress ?? ''}` : t('uploadImages')}
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={locked || uploading} onChange={(e) => void onUpload(e)} />
        </label>
        {failedUploads.length > 0 && <button className="btn-ghost" type="button" disabled={uploading || locked} onClick={retryUploads}>{t('retryFailedUploads')} ({failedUploads.length})</button>}
        <ul className="space-y-3">
          {images.map((img, i) => (
            <ImageCard key={`${img.id}-${img.position}`} image={img} url={urls[img.id]} saved={counts[img.id] ?? 0} limits={pieceLimits}
              first={i === 0} last={i === images.length - 1} locked={!!locked} progress={progress[img.id]}
              onMeta={onMeta} onMove={onMove} onDelete={onDelete} onGenerate={onGenerate} onImageError={onImageError} onImageLoad={onImageLoad} />
          ))}
        </ul>
      </section>
    </div>
  )
}

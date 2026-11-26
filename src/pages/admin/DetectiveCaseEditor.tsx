import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAdminCase, publishDetectiveCase } from '../../detective/api'
import { HotspotEditor, type EditorEvidence, type EditorScene } from '../../detective/HotspotEditor'
import { supabase } from '../../lib/supabase'

type Scene = EditorScene & { introduction: string | null; introduction_ar: string | null }
const EVIDENCE_COLS = 'id,scene_id,evidence_key,internal_title,public_title,public_title_ar,public_description,public_description_ar,admin_explanation_ar,x,y,width,height,classification,importance'

export default function DetectiveCaseEditor() {
  const { id } = useParams<{ id: string }>()
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof getAdminCase>> | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [evidence, setEvidence] = useState<EditorEvidence[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [sceneTitle, setSceneTitle] = useState('')
  const [sceneTitleAr, setSceneTitleAr] = useState('')
  const [sceneImage, setSceneImage] = useState('')
  const [error, setError] = useState('')
  const versionId = meta?.versions[0]?.id

  const reload = useCallback(async () => {
    if (!id) return
    try {
      const data = await getAdminCase(id); setMeta(data)
      const v = data.versions[0]?.id; if (!v) return
      const s = await supabase.from('detective_scenes').select('id,position,title,title_ar,image_path,introduction,introduction_ar').eq('version_id', v).order('position')
      if (s.error) throw s.error
      const list = (s.data ?? []) as Scene[]
      const e = list.length ? await supabase.from('detective_evidence').select(EVIDENCE_COLS).in('scene_id', list.map((x) => x.id)) : { data: [], error: null }
      if (e.error) throw e.error
      setScenes(list); setEvidence((e.data ?? []) as EditorEvidence[])
      setActive((a) => (a && list.some((x) => x.id === a) ? a : list[0]?.id ?? null))
    } catch (e) { setError((e as Error).message) }
  }, [id])
  useEffect(() => { void reload() }, [reload])

  const addScene = async (event: FormEvent) => {
    event.preventDefault(); if (!versionId || !sceneTitle.trim() || !sceneTitleAr.trim() || !sceneImage.trim()) return
    const result = await supabase.from('detective_scenes').insert({ version_id: versionId, position: scenes.length + 1, title: sceneTitle.trim(), title_ar: sceneTitleAr.trim(), image_path: sceneImage.trim() })
    if (result.error) setError(result.error.message); else { setSceneTitle(''); setSceneTitleAr(''); setSceneImage(''); await reload() }
  }
  const setStatus = async (status: string) => {
    if (!id || !versionId) return
    setError('')
    try {
      if (status === 'PUBLISHED') await publishDetectiveCase(id)
      else {
        const a = await supabase.from('detective_cases').update({ status: 'DRAFT', published_at: null }).eq('id', id)
        const b = await supabase.from('detective_case_versions').update({ status: 'DRAFT', published_at: null }).eq('id', versionId)
        if (a.error || b.error) throw new Error(a.error?.message ?? b.error?.message ?? 'Could not update status')
      }
      await reload()
    } catch (e) { setError((e as Error).message) }
  }
  const scene = scenes.find((s) => s.id === active) ?? null
  const published = meta?.case.status === 'PUBLISHED'

  return (
    <div className="space-y-5">
      <Link className="text-sm text-gold-400" to="/admin/detective">← Back to Detective Studio</Link>
      {meta && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs uppercase tracking-widest text-gold-400">{meta.case.status} · v{meta.versions[0]?.version_number} · {evidence.length} clues</p>
            <h1 className="font-display text-3xl">{meta.case.title_ar}</h1><p className="opacity-70">{meta.case.title}</p></div>
          <div className="flex gap-2"><button className="btn-primary" onClick={() => void setStatus('PUBLISHED')}>{published ? 'Re-validate & publish' : 'Publish case'}</button>
            {published && <button className="btn-ghost" onClick={() => void setStatus('DRAFT')}>Unpublish (draft)</button>}</div>
        </header>
      )}
      {error && <p className="text-danger" role="alert">{error}</p>}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="me-2 font-display text-2xl">🗺️ محرر أماكن الأدلة</h2>
          {scenes.map((s) => (
            <button key={s.id} type="button" onClick={() => setActive(s.id)}
              className={`rounded-xl border px-3 py-1.5 text-sm ${s.id === active ? 'border-gold-400 bg-gold-400/15' : 'border-parchment-200/20'}`}>
              {s.position}. {s.title_ar} <span className="opacity-60">({evidence.filter((e) => e.scene_id === s.id).length})</span>
            </button>
          ))}
        </div>
        {scene ? <HotspotEditor key={scene.id} scene={scene} items={evidence.filter((e) => e.scene_id === scene.id)} published={published} onSaved={reload} />
          : <p className="opacity-70">أضف مشهد بصورة الأول، وبعدين حدّد عليه الأدلة.</p>}
      </section>

      <form className="card grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => void addScene(e)}>
        <input className="input" value={sceneTitle} onChange={(e) => setSceneTitle(e.target.value)} placeholder="Scene title" required />
        <input className="input" dir="rtl" value={sceneTitleAr} onChange={(e) => setSceneTitleAr(e.target.value)} placeholder="عنوان المشهد" required />
        <input className="input" value={sceneImage} onChange={(e) => setSceneImage(e.target.value)} placeholder="Image path or URL" required />
        <button className="btn-primary">Add scene</button>
      </form>
    </div>
  )
}

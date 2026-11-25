import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAdminCase, publishDetectiveCase } from '../../detective/api'
import { supabase } from '../../lib/supabase'

type Scene = { id: string; position: number; title: string; title_ar: string; image_path: string; introduction: string | null; introduction_ar: string | null }
type Evidence = { id: string; scene_id: string; evidence_key: string; internal_title: string; public_title: string; public_title_ar: string; x: number; y: number; width: number; height: number; classification: string; importance: number }
export default function DetectiveCaseEditor() {
  const { id } = useParams<{ id: string }>()
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof getAdminCase>> | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [sceneTitle, setSceneTitle] = useState('')
  const [sceneTitleAr, setSceneTitleAr] = useState('')
  const [sceneImage, setSceneImage] = useState('')
  const [error, setError] = useState('')
  const versionId = meta?.versions[0]?.id
  const reload = async () => { if (!id) return; try { const data = await getAdminCase(id); setMeta(data); const v = data.versions[0]?.id; if (!v) return; const [s, e] = await Promise.all([supabase.from('detective_scenes').select('id,position,title,title_ar,image_path,introduction,introduction_ar').eq('version_id', v).order('position'), supabase.from('detective_evidence').select('id,scene_id,evidence_key,internal_title,public_title,public_title_ar,x,y,width,height,classification,importance').in('scene_id', (await supabase.from('detective_scenes').select('id').eq('version_id', v)).data?.map((row) => row.id) ?? [])]); if (s.error) throw s.error; if (e.error) throw e.error; setScenes((s.data ?? []) as Scene[]); setEvidence((e.data ?? []) as Evidence[]) } catch (e) { setError((e as Error).message) } }
  useEffect(() => { void reload() }, [id])
  const addScene = async (event: FormEvent) => { event.preventDefault(); if (!versionId || !sceneTitle.trim() || !sceneTitleAr.trim() || !sceneImage.trim()) return; const result = await supabase.from('detective_scenes').insert({ version_id: versionId, position: scenes.length + 1, title: sceneTitle.trim(), title_ar: sceneTitleAr.trim(), image_path: sceneImage.trim() }); if (result.error) setError(result.error.message); else { setSceneTitle(''); setSceneTitleAr(''); setSceneImage(''); await reload() } }
  const setStatus = async (status: string) => { if (!id || !versionId) return; try { if (status === 'PUBLISHED') await publishDetectiveCase(id); else { const a = await supabase.from('detective_cases').update({ status: 'DRAFT', published_at: null }).eq('id', id); const b = await supabase.from('detective_case_versions').update({ status: 'DRAFT', published_at: null }).eq('id', versionId); if (a.error || b.error) throw new Error(a.error?.message ?? b.error?.message ?? 'Could not update status') } await reload() } catch (e) { setError((e as Error).message) } }
  return <div className="space-y-5"><Link className="text-sm text-gold-400" to="/admin/detective">← Back to Detective Studio</Link>{meta && <header><p className="text-xs uppercase tracking-widest text-gold-400">{meta.case.status} · v{meta.versions[0]?.version_number}</p><h1 className="font-display text-3xl">{meta.case.title}</h1><p dir="rtl" className="text-xl">{meta.case.title_ar}</p><div className="mt-3 flex gap-2"><button className="btn-primary" onClick={() => void setStatus('PUBLISHED')}>Publish case</button><button className="btn-ghost" onClick={() => void setStatus('DRAFT')}>Keep draft</button></div></header>}
    {error && <p className="text-danger" role="alert">{error}</p>}
    <form className="card grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => void addScene(e)}><input className="input" value={sceneTitle} onChange={(e) => setSceneTitle(e.target.value)} placeholder="Scene title" required /><input className="input" dir="rtl" value={sceneTitleAr} onChange={(e) => setSceneTitleAr(e.target.value)} placeholder="عنوان المشهد" required /><input className="input" value={sceneImage} onChange={(e) => setSceneImage(e.target.value)} placeholder="Image path or URL" required /><button className="btn-primary">Add scene</button></form>
    <div className="grid gap-4 md:grid-cols-2">{scenes.map((scene) => <article key={scene.id} className="card"><img className="aspect-video w-full rounded-xl object-cover" src={scene.image_path.startsWith('http') ? scene.image_path : `/${scene.image_path.replace(/^\//, '')}`} alt={scene.title} /><h2 className="mt-3 font-display text-2xl">{scene.position}. {scene.title}</h2><p dir="rtl">{scene.title_ar}</p><div className="mt-3 space-y-2">{evidence.filter((item) => item.scene_id === scene.id).map((item) => <div key={item.id} className="rounded-xl border border-parchment-200/15 p-3 text-sm"><strong>{item.public_title}</strong> · {item.classification}<p className="opacity-70">x {item.x}% · y {item.y}% · {item.width}% × {item.height}%</p></div>)}<p className="text-xs opacity-60">Add hotspots and questions through the case version API or the next editor panel.</p></div></article>)}</div>
  </div>
}

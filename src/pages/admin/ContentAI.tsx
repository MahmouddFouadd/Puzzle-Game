import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { listCategories, requestStoryGeneration, saveGeneratedStoryDraft, type ContentCategory } from '../../content/api'

export default function ContentAI() {
  const { t, lang } = useI18n()
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [topic, setTopic] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [ageMin, setAgeMin] = useState(7)
  const [ageMax, setAgeMax] = useState(9)
  const [difficulty, setDifficulty] = useState(2)
  const [scenes, setScenes] = useState(3)
  const [questionsPerScene, setQuestionsPerScene] = useState(4)
  const [result, setResult] = useState<unknown>(null)
  const [jobId, setJobId] = useState('')
  const [resultSubjectId, setResultSubjectId] = useState('')
  const [savedStoryId, setSavedStoryId] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [providerMissing, setProviderMissing] = useState(false)

  const loadCategories = useCallback(async () => {
    try { setCategories(await listCategories(true)) } catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
  }, [t])
  useEffect(() => { void loadCategories() }, [loadCategories])

  const generate = async (event: React.FormEvent) => {
    event.preventDefault()
    const category = categories.find((item) => item.id === subjectId)
    if (!category) { setError(t('loadFailed')); return }
    setBusy(true); setError(''); setNotice(''); setResult(null); setJobId(''); setResultSubjectId(''); setSavedStoryId(''); setProviderMissing(false)
    try {
      const response = await requestStoryGeneration({ topic: topic.trim(), subject: category.name_en, age_min: ageMin, age_max: ageMax, difficulty, scenes, questions_per_scene: questionsPerScene })
      setJobId(response.job_id); setResultSubjectId(category.id); setResult(response.result)
    } catch (e) {
      const message = e instanceof Error ? e.message : t('generationFailed')
      setProviderMissing(message.toLowerCase().includes('provider_not_configured'))
      setError(message)
    } finally { setBusy(false) }
  }

  const saveDraft = async () => {
    if (!jobId || !resultSubjectId || !result) return
    setSavingDraft(true); setError(''); setNotice('')
    try {
      const storyId = await saveGeneratedStoryDraft(jobId, resultSubjectId)
      setSavedStoryId(storyId)
      setNotice(t('aiDraftSaved'))
    } catch (e) { setError(e instanceof Error ? e.message : t('saveFailed')) }
    finally { setSavingDraft(false) }
  }

  const categoryLabel = (category: ContentCategory) => lang === 'ar' ? category.name_ar : category.name_en
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
      <form className="card h-fit space-y-3" onSubmit={(e) => void generate(e)}>
        <h3 className="font-display text-2xl">{t('generateDraft')}</h3>
        <label>{t('topic')}<input className="input mt-1" required maxLength={160} value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
        <label>{t('subject')}<select className="input mt-1" required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label>{t('ageFrom')}<input className="input mt-1" type="number" min="4" max="99" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} /></label><label>{t('ageTo')}<input className="input mt-1" type="number" min="4" max="99" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} /></label></div>
        <label>{t('difficulty')}<select className="input mt-1" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label>{t('sceneCount')}<select className="input mt-1" value={scenes} onChange={(e) => setScenes(Number(e.target.value))}>{[3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><label>{t('questionsPerScene')}<select className="input mt-1" value={questionsPerScene} onChange={(e) => setQuestionsPerScene(Number(e.target.value))}>{[4,5,6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label></div>
        <p className="rounded-xl bg-ink-700/70 p-3 text-sm">{t('providerSetupHelp')} {t('reviewQueue')}: AI output is always a draft and needs a human review.</p>
        {error && <p role="alert" className="text-danger">{providerMissing ? t('providerNotConfigured') : `${t('generationFailed')} ${error}`}</p>}
        <button className="btn-primary" type="submit" disabled={busy || !categories.length || ageMin > ageMax}>{busy ? t('generating') : t('generateDraft')}</button>
      </form>
      <section className="card min-h-64 space-y-3">
        <h3 className="font-display text-2xl">{t('contentStudio')}</h3>
        <p className="text-sm opacity-80">{t('aiImagePromptNote')}</p>
        {jobId && <p className="text-xs opacity-60">Job: {jobId}</p>}
        {notice && <p role="status" className="text-emerald-300">{notice}</p>}
        {savedStoryId && <Link className="btn-secondary inline-flex" to={`/admin/stories/${savedStoryId}`}>{t('edit')} · {t('story')}</Link>}
        {result ? <><pre className="max-h-[70vh] overflow-auto rounded-xl bg-ink-950 p-4 text-xs leading-relaxed" dir="auto">{JSON.stringify(result, null, 2)}</pre><button className="btn-primary" type="button" onClick={() => void saveDraft()} disabled={savingDraft || !!savedStoryId}>{savingDraft ? t('saving') : t('aiSaveDraft')}</button></> : <p className="opacity-70">{providerMissing ? t('providerNotConfigured') : t('comingSoon')}</p>}
      </section>
    </div>
  )
}

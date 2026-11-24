import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useI18n } from '../../lib/i18n'
import {
  createImportBatch, getImportStoryLimit, importContentStory, listCategories, listImportBatches,
  recordImportErrors, updateImportBatch, uploadContentAsset, type ContentCategory
} from '../../content/api'
import { createExcelTemplate, parseContentPackage, type ImportIssue, type ParsedContentPackage } from '../../content/importer'

type Batch = Awaited<ReturnType<typeof listImportBatches>>[number]

async function payloadHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function categoryFor(subject: string, categories: ContentCategory[]): ContentCategory | undefined {
  const key = subject.trim().toLowerCase().replace(/[\s-]+/g, '-')
  return categories.find((c) => c.slug.toLowerCase() === key || c.name_en.toLowerCase() === subject.trim().toLowerCase())
}

export default function ContentImport() {
  const { t } = useI18n()
  const [workbookFile, setWorkbookFile] = useState<File | null>(null)
  const [imagesFile, setImagesFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState(true)
  const [parsed, setParsed] = useState<ParsedContentPackage | null>(null)
  const [batchId, setBatchId] = useState('')
  const [batchStatus, setBatchStatus] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [runtimeIssues, setRuntimeIssues] = useState<ImportIssue[]>([])
  const [busy, setBusy] = useState(false)

  const refreshHistory = useCallback(async () => {
    try { setBatches(await listImportBatches()) } catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
  }, [t])
  useEffect(() => {
    void Promise.all([listCategories(), refreshHistory()]).then(([rows]) => setCategories(rows)).catch((e) => setError(e instanceof Error ? e.message : t('loadFailed')))
  }, [refreshHistory, t])

  const downloadTemplate = async () => {
    setError('')
    try {
      const blob = await createExcelTemplate()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'story-puzzle-content-template.xlsx'; link.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : t('errGeneric')) }
  }

  const chooseWorkbook = (event: ChangeEvent<HTMLInputElement>) => { setWorkbookFile(event.target.files?.[0] ?? null); setParsed(null); setBatchId(''); setBatchStatus(''); setNotice('') }
  const chooseImages = (event: ChangeEvent<HTMLInputElement>) => { setImagesFile(event.target.files?.[0] ?? null); setParsed(null); setBatchId(''); setBatchStatus(''); setNotice('') }

  const validate = async () => {
    if (!workbookFile) { setError(t('selectWorkbook')); return }
    setBusy(true); setError(''); setNotice(''); setRuntimeIssues([]); setParsed(null); setBatchId('')
    try {
      const result = await parseContentPackage(workbookFile, imagesFile)
      let final: ParsedContentPackage = result
      const maxRows = await getImportStoryLimit()
      if (result.stories.length > maxRows) {
        const issue: ImportIssue = { sheet: 'Stories', row: 0, code: 'import_limit', message: t('importRowLimit') }
        final = { ...result, validStories: [], invalidStoryKeys: result.stories.map((story) => story.story_key), issues: [...result.issues, issue] }
      }
      setParsed(final)
      const status = dryRun ? 'COMPLETED' : final.validStories.length > 0 ? 'READY' : 'FAILED'
      const id = await createImportBatch({
        filename: `${workbookFile.name}${imagesFile ? ` + ${imagesFile.name}` : ''}`.slice(0, 255),
        total_rows: final.stories.length, valid_rows: final.validStories.length, error_rows: final.issues.length,
        dry_run: dryRun, status
      })
      setBatchId(id)
      setBatchStatus(status)
      await recordImportErrors(id, final.issues)
      if (dryRun) setNotice(t('dryRunDone'))
      await refreshHistory()
    } catch (e) { setError(e instanceof Error ? e.message : t('importFailed')) }
    finally { setBusy(false) }
  }

  const importStories = async () => {
    if (!parsed || !batchId || dryRun || !parsed.validStories.length) return
    setBusy(true); setError(''); setNotice(''); setRuntimeIssues([])
    const errors: ImportIssue[] = []
    let imported = 0
    try {
      await updateImportBatch(batchId, { status: 'IMPORTING' })
      setBatchStatus('IMPORTING')
      for (let index = 0; index < parsed.validStories.length; index++) {
        const story = parsed.validStories[index]
        try {
          const uploadedImages: Array<Record<string, unknown>> = []
          for (const image of story.images) {
            if (!image.file) throw new Error(`image_missing:${image.filename}`)
            const { asset } = await uploadContentAsset(image.file, { license_type: story.license_type, attribution: story.attribution, source_type: 'IMPORT' })
            uploadedImages.push({ image_key: image.image_key, asset_id: asset.id, title: image.title, description: image.description, image_prompt: image.image_prompt })
          }
          const category = categoryFor(story.subject, categories)
          const draft = {
            story_key: story.story_key, title: story.title, description: story.description, subject: story.subject,
            category: category?.slug ?? story.subject, subject_id: category?.id ?? null,
            age_min: story.age_min, age_max: story.age_max, difficulty: story.difficulty, language: story.language,
            source_type: story.source_type, source_reference: story.source_reference, license_type: story.license_type,
            attribution: story.attribution, notes: story.notes
          }
          const questions = story.questions.map((q) => ({
            question_key: q.question_key, image_key: q.image_key, type: q.type, text: q.text,
            explanation: q.explanation, hint: '', difficulty: q.difficulty, options: q.options, answers: q.answers
          }))
          const stablePayload = { draft, images: uploadedImages, questions, tags: story.tags }
          const storyPayload = { ...draft, payload_hash: await payloadHash(stablePayload) }
          await importContentStory(batchId, storyPayload, uploadedImages, questions, story.tags)
          imported++
        } catch (e) {
          errors.push({ sheet: 'Stories', row: index + 2, field: story.story_key, code: 'story_import_failed', message: e instanceof Error ? e.message.slice(0, 1000) : t('importFailed') })
        }
      }
      if (errors.length) await recordImportErrors(batchId, errors)
      const errorCount = (parsed.issues.length + errors.length)
      const status = errorCount ? imported ? 'PARTIAL' : 'FAILED' : 'COMPLETED'
      await updateImportBatch(batchId, { status, error_rows: errorCount, finished_at: new Date().toISOString() })
      setBatchStatus(status)
      setRuntimeIssues(errors)
      setNotice(`${t('importDone')} ${t('validRows')}: ${imported}`)
      await refreshHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('importFailed'))
      const status = imported ? 'PARTIAL' : 'FAILED'
      setBatchStatus(status)
      try { await updateImportBatch(batchId, { status, error_rows: parsed.issues.length + errors.length, finished_at: new Date().toISOString() }) } catch { /* keep original error */ }
      setRuntimeIssues(errors)
      await refreshHistory()
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-2xl">{t('excelImport')}</h3>
          <button className="btn-ghost" type="button" onClick={() => void downloadTemplate()}>{t('downloadTemplate')}</button>
        </div>
        <p className="text-sm opacity-75">{t('contentImportHelp')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label>{t('selectWorkbook')}<input className="input mt-1" type="file" accept=".xlsx,.zip" onChange={chooseWorkbook} /></label>
          {workbookFile && !workbookFile.name.toLowerCase().endsWith('.zip') && <label>{t('selectImageZip')}<input className="input mt-1" type="file" accept=".zip" onChange={chooseImages} /></label>}
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={dryRun} onChange={(e) => { setDryRun(e.target.checked); setParsed(null); setBatchId(''); setBatchStatus(''); setNotice('') }} /><span>{t('dryRun')} — {t('validateInfo')}</span></label>
        <button className="btn-primary w-fit" type="button" disabled={busy || !workbookFile} onClick={() => void validate()}>{busy ? t('loading') : t('validateImport')}</button>
      </section>
      {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-ok">{notice}</p>}
      {parsed && <section className="card space-y-3">
        <h3 className="font-display text-xl">{t('importPreview')}</h3>
        <p className="text-sm">{t('validRows')}: {parsed.validStories.length} / {parsed.stories.length} · {t('invalidRowsLabel')}: {parsed.issues.length} · {t('batchStatus')}: {batchId || '—'}</p>
        <ul className="max-h-72 space-y-2 overflow-auto">{parsed.stories.map((story) => {
          const invalid = parsed.invalidStoryKeys.includes(story.story_key)
          return <li key={story.story_key} className="rounded-xl bg-ink-700/60 p-3">
            <div className="flex flex-wrap justify-between gap-2"><strong>{story.title || '—'}</strong><span className={invalid ? 'text-danger' : 'text-ok'}>{invalid ? t('invalidRowsLabel') : t('validRows')}</span></div>
            <p className="text-xs opacity-70">{t('storyKeyLabel')}: {story.story_key} · {story.subject} · {story.age_min}–{story.age_max} · {t('imageCount')}: {story.images.length} · {t('questionCount')}: {story.questions.length}</p>
          </li>
        })}</ul>
        {!!parsed.issues.length && <div><h4 className="font-semibold">{t('invalidRowsLabel')} ({parsed.issues.length})</h4><ul className="mt-2 max-h-60 space-y-1 overflow-auto text-sm">{parsed.issues.slice(0, 200).map((item, index) => <li key={`${item.sheet}-${item.row}-${item.code}-${index}`} className="text-danger">{item.sheet}{item.row ? ` · row ${item.row}` : ''}{item.field ? ` · ${item.field}` : ''}: {item.message}</li>)}</ul>{parsed.issues.length > 200 && <p className="text-xs opacity-70">Showing the first 200 validation errors.</p>}</div>}
        {!dryRun && <div className="space-y-2"><p className="text-sm opacity-75">Imported stories remain editorial drafts. Story images, generated puzzle pieces and question-to-piece assignments still use the existing Story Editor workflow.</p><button className="btn-primary" type="button" disabled={busy || !batchId || !parsed.validStories.length || batchStatus === 'COMPLETED' || batchStatus === 'IMPORTING'} onClick={() => void importStories()}>{busy ? t('loading') : `${t('importValidStories')} (${parsed.validStories.length})`}</button></div>}
      </section>}
      {!!runtimeIssues.length && <section className="card"><h3 className="font-semibold">{t('importFailed')}</h3><ul className="mt-2 space-y-1 text-sm">{runtimeIssues.map((item, index) => <li key={`${item.row}-${index}`} className="text-danger">{item.field} · row {item.row}: {item.message}</li>)}</ul></section>}
      <section className="card space-y-3">
        <h3 className="font-display text-2xl">{t('excelImport')} · {t('reviewHistory')}</h3>
        {batches.length === 0 ? <p className="opacity-70">{t('noBatches')}</p> : <ul className="space-y-2">{batches.map((batch) => <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-700/60 p-3 text-sm"><span className="min-w-0 truncate">{batch.filename}</span><span>{batch.status} · {t('validRows')}: {batch.valid_rows}/{batch.total_rows} · {t('importedStories')}: {batch.imported_rows} · {t('errorRows')}: {batch.error_rows}</span><time className="text-xs opacity-70">{new Date(batch.created_at).toLocaleString()}</time></li>)}</ul>}
      </section>
    </div>
  )
}

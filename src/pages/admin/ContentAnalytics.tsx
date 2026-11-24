import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../lib/i18n'
import { contentAnalytics } from '../../content/api'

type Metrics = Awaited<ReturnType<typeof contentAnalytics>>
const metricKeys: Array<[keyof Metrics, 'analyticsStories' | 'analyticsDrafts' | 'analyticsReview' | 'analyticsApproved' | 'analyticsPublished' | 'analyticsQuestions' | 'analyticsAssets' | 'analyticsUnused' | 'analyticsFailedImports' | 'analyticsFailedAI']> = [
  ['stories','analyticsStories'],['drafts','analyticsDrafts'],['review','analyticsReview'],['approved','analyticsApproved'],['published','analyticsPublished'],
  ['questions','analyticsQuestions'],['assets','analyticsAssets'],['unusedAssets','analyticsUnused'],['failedImports','analyticsFailedImports'],['aiFailed','analyticsFailedAI']
]

export default function ContentAnalytics() {
  const { t } = useI18n()
  const [data, setData] = useState<Metrics | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await contentAnalytics()) } catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void reload() }, [reload])
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><p className="opacity-75">{t('contentAnalytics')}</p><button className="btn-ghost" type="button" onClick={() => void reload()}>{t('refreshData')}</button></div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {loading ? <p role="status">{t('loading')}</p> : data && <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metricKeys.map(([key,label]) => <div key={key} className="card"><dt className="text-sm opacity-70">{t(label)}</dt><dd className="mt-2 font-display text-3xl text-gold-400">{data[key]}</dd></div>)}</dl>}
      <p className="text-xs opacity-60">Counts come from the authorized Supabase session; this screen does not use design-target numbers as live statistics.</p>
    </div>
  )
}

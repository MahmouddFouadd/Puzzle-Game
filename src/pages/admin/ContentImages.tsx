import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useI18n } from '../../lib/i18n'
import { assetPreviewUrl, attachAssetToStory, listAssets, listContentStories, uploadContentAsset, type ContentAsset, type ContentStory } from '../../content/api'

export default function ContentImages() {
  const { t } = useI18n()
  const [assets, setAssets] = useState<ContentAsset[]>([])
  const [stories, setStories] = useState<ContentStory[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [unusedOnly, setUnusedOnly] = useState(false)
  const [license, setLicense] = useState('UNKNOWN')
  const [attribution, setAttribution] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reload = useCallback(async () => {
    setError('')
    try {
      const [assetResult, storyResult] = await Promise.all([
        listAssets({ search, unusedOnly, page: 0, pageSize: 100 }),
        listContentStories({ gameplayStatus: 'DRAFT', page: 0, pageSize: 100 })
      ])
      setAssets(assetResult.rows); setStories(storyResult.rows)
      const previews = await Promise.all(assetResult.rows.map(async (asset) => {
        try { return [asset.id, await assetPreviewUrl(asset.storage_path)] as const } catch { return [asset.id, ''] as const }
      }))
      setUrls(Object.fromEntries(previews.filter(([, url]) => url)))
    } catch (e) { setError(e instanceof Error ? e.message : t('loadFailed')) }
  }, [search, t, unusedOnly])

  useEffect(() => { void reload() }, [reload])

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setBusy(true); setError(''); setNotice('')
    try {
      let duplicate = false
      for (const file of files) {
        const result = await uploadContentAsset(file, { license_type: license, attribution })
        if (result.duplicate) duplicate = true
      }
      setNotice(duplicate ? t('duplicateAsset') : t('saved'))
      await reload()
    } catch (e) { setError(e instanceof Error ? e.message : t('errGeneric')) }
    finally { setBusy(false) }
  }

  const useInStory = async (asset: ContentAsset) => {
    const storyId = selected[asset.id]
    if (!storyId) { setError(t('chooseStory')); return }
    setBusy(true); setError(''); setNotice('')
    try {
      await attachAssetToStory(storyId, asset.id, asset.original_filename.replace(/\.[^.]+$/, '').slice(0, 80))
      setNotice(t('useInStory')); await reload()
    } catch (e) { setError(e instanceof Error ? e.message : t('errGeneric')) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <section className="card grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="block xl:col-span-2">{t('searchContent')}<input className="input mt-1" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label className="block">{t('licenseType')}<select className="input mt-1" value={license} onChange={(e) => setLicense(e.target.value)}><option value="UNKNOWN">UNKNOWN</option><option value="CC0">CC0</option><option value="CC-BY">CC-BY</option><option value="CC-BY-SA">CC-BY-SA</option><option value="OWNED">Owned / original</option><option value="PUBLIC_DOMAIN">Public domain</option></select></label>
        <label className="block">{t('attribution')}<input className="input mt-1" value={attribution} onChange={(e) => setAttribution(e.target.value)} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} />{t('unusedAssets')}</label>
        <label className={`btn-primary w-fit cursor-pointer ${busy ? 'opacity-60' : ''}`}>
          {busy ? t('uploadingAsset') : t('uploadAsset')}
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={(e) => void upload(e)} />
        </label>
      </section>
      {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-ok">{notice}</p>}
      {assets.length === 0 ? <p className="card">{t('noAssets')}</p> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.id} className="card space-y-3">
              {urls[asset.id] ? <img src={urls[asset.id]} alt={asset.original_filename} className="h-48 w-full rounded-xl bg-ink-700 object-contain" /> : <div className="grid h-48 place-items-center rounded-xl bg-ink-700 text-sm opacity-70">{t('loading')}</div>}
              <div className="min-w-0"><h3 className="truncate font-semibold" title={asset.original_filename}>{asset.original_filename}</h3><p className="text-xs opacity-70">{asset.width}×{asset.height} · {asset.mime_type} · {asset.file_size ? `${Math.round(asset.file_size / 1024)} KB` : '—'}</p><p className="text-xs opacity-70">{t('licenseType')}: {asset.license_type} · {t('usedInStories')}: {asset.usageCount}</p><p className="break-all text-xs opacity-55">SHA-256: {asset.sha256 ?? '—'}</p></div>
              <div className="flex gap-2">
                <select className="input min-w-0 flex-1" aria-label={t('chooseStory')} value={selected[asset.id] ?? ''} onChange={(e) => setSelected((old) => ({ ...old, [asset.id]: e.target.value }))}>
                  <option value="">{t('chooseStory')}</option>{stories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
                </select>
                <button className="btn-ghost" type="button" disabled={busy || !stories.length} onClick={() => void useInStory(asset)}>{t('useInStory')}</button>
              </div>
              {!stories.length && <p className="text-xs opacity-70">{t('noStoryChoices')}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

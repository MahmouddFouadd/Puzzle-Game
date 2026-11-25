import { supabase } from '../lib/supabase'
import { generatePuzzle, type PieceGeometry } from '../puzzle/engine'
import { uploadContentAsset } from '../content/api'
import { resolveImageUrl } from '../storage/imageUrl'
import type { Story, StoryImage } from './types'

const MAX_BYTES = 15 * 1024 * 1024

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  if (r.data === null) throw new Error('empty response')
  return r.data
}

export async function listStories(): Promise<Story[]> {
  return must(await supabase.from('stories').select('*').order('created_at', { ascending: false })) as Story[]
}
export async function createStory(title: string, userId: string): Promise<Story> {
  return must(await supabase.from('stories').insert({ title, created_by: userId }).select('*').single()) as Story
}
export async function getStory(id: string): Promise<Story> {
  return must(await supabase.from('stories').select('*').eq('id', id).single()) as Story
}
export async function updateStory(id: string, patch: Partial<Pick<Story, 'title' | 'description' | 'category' | 'subject' | 'difficulty' | 'language'>>): Promise<void> {
  const { data, error } = await supabase.from('stories').update(patch).eq('id', id).select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('story_not_updated')
}
export async function listImages(storyId: string): Promise<StoryImage[]> {
  return must(await supabase.from('story_images').select('*').eq('story_id', storyId).order('position')) as StoryImage[]
}
export async function pieceCounts(imageIds: string[]): Promise<Record<string, number>> {
  if (!imageIds.length) return {}
  const rows = must(await supabase.from('puzzle_pieces').select('image_id').in('image_id', imageIds)) as { image_id: string }[]
  return rows.reduce<Record<string, number>>((acc, r) => { acc[r.image_id] = (acc[r.image_id] ?? 0) + 1; return acc }, {})
}
export async function signedOriginalUrl(path: string): Promise<string> {
  return resolveImageUrl(path, 'story-originals', 3600)
}

export async function uploadImage(storyId: string, file: File, nextPosition: number): Promise<void> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('unsupported_type')
  if (file.size > MAX_BYTES) throw new Error('file_too_large')
  const uploaded = await uploadContentAsset(file, { license_type: 'UNKNOWN', source_type: 'UPLOAD' })
  const asset = uploaded.asset
  const ins = await supabase.from('story_images').insert({
    story_id: storyId, position: nextPosition, title: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
    storage_path: asset.storage_path, width: asset.width, height: asset.height, piece_count: 12, puzzle_seed: Math.floor(Math.random() * 1_000_000)
  }).select('id').single()
  if (ins.error || !ins.data) throw new Error(ins.error?.message ?? 'image_insert_failed')
  const usage = await supabase.rpc('register_story_image_asset', { p_asset: asset.id, p_image: ins.data.id })
  if (usage.error) {
    await supabase.from('story_images').delete().eq('id', ins.data.id)
    throw new Error(usage.error.message)
  }
}

export async function updateImage(id: string, patch: Partial<Pick<StoryImage, 'title' | 'description' | 'hint'>>): Promise<void> {
  const { data, error } = await supabase.from('story_images').update(patch).eq('id', id).select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('image_not_updated')
}
export async function deleteImage(img: StoryImage): Promise<void> {
  const old = await supabase.from('puzzle_pieces').select('mask_path').eq('image_id', img.id)
  if (old.error) throw new Error(old.error.message)
  const { data, error } = await supabase.from('story_images').delete().eq('id', img.id).select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('image_not_deleted')
  const masks = ((old.data ?? []) as { mask_path: string | null }[]).map((r) => r.mask_path).filter((p): p is string => !!p)
  // Keep source originals in the reusable asset library; deleting a story-image
  // relationship must not delete a file shared by another story or still catalogued.
  if (masks.length) await supabase.storage.from('story-pieces').remove(masks)
}
export async function reorderImages(storyId: string, ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_story_images', { p_story: storyId, p_ids: ids })
  if (error) throw new Error(error.message)
}

/** Render one piece to a transparent PNG containing exactly its region of the original image. */
export async function renderPiecePng(bitmap: ImageBitmap, piece: PieceGeometry): Promise<Blob> {
  const { x, y, w, h } = piece.bbox
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.translate(-x, -y)
  ctx.clip(new Path2D(piece.path))
  ctx.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png_failed'))), 'image/png'))
}

/**
 * Generate pieces for an image: build geometry, render one PNG per piece into the private bucket,
 * then replace the database rows atomically. Old piece files are removed only after the DB step succeeds.
 */
export async function generateAndSave(
  img: StoryImage, count: number, seed: number, force: boolean, onProgress: (done: number, total: number) => void
): Promise<number> {
  const layout = generatePuzzle({ width: img.width, height: img.height, pieceCount: count, seed })
  let response: Response
  try { response = await fetch(await signedOriginalUrl(img.storage_path)) }
  catch { throw new Error('image_download_failed') }
  if (!response.ok) throw new Error('image_download_failed')
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/')) throw new Error('invalid_image_response')
  const blob = await response.blob()
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(blob) }
  catch { throw new Error('image_decode_failed') }
  try {
    if (bitmap.width !== img.width || bitmap.height !== img.height) throw new Error('image_size_mismatch')
    const old = await supabase.from('puzzle_pieces').select('mask_path').eq('image_id', img.id)
    if (old.error) throw new Error(old.error.message)
    const oldMasks = ((old.data ?? []) as { mask_path: string | null }[]).map((r) => r.mask_path).filter((p): p is string => !!p)
    const rows: { row: number; col: number; x: number; y: number; w: number; h: number; path: string; mask: string }[] = []
    let done = 0
    const uploadedMasks: string[] = []
    const generationId = crypto.randomUUID()
    try {
      for (let i = 0; i < layout.pieces.length; i += 6) {
        const batch = await Promise.allSettled(layout.pieces.slice(i, i + 6).map(async (p) => {
          const mask = `${img.id}/${generationId}/${p.row}-${p.col}.png`
          const png = await renderPiecePng(bitmap, p)
          const up = await supabase.storage.from('story-pieces').upload(mask, png, { contentType: 'image/png', upsert: false })
          if (up.error) throw new Error(up.error.message)
          uploadedMasks.push(mask)
          onProgress(++done, layout.pieces.length)
          return { row: p.row, col: p.col, x: p.bbox.x, y: p.bbox.y, w: p.bbox.w, h: p.bbox.h, path: p.path, mask }
        }))
        const failed = batch.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failed) throw failed.reason instanceof Error ? failed.reason : new Error('piece_upload_failed')
        rows.push(...batch.map((result) => (result as PromiseFulfilledResult<(typeof rows)[number]>).value))
      }

      const { data, error } = await supabase.rpc('save_image_pieces', { p_image: img.id, p_seed: seed, p_pieces: rows, p_force: force })
      if (error) throw new Error(error.message)
      if (typeof data !== 'number' || data !== rows.length) throw new Error('piece_save_incomplete')

      const stale = oldMasks.filter((mask) => !uploadedMasks.includes(mask))
      if (stale.length) {
        const cleanup = await supabase.storage.from('story-pieces').remove(stale)
        if (cleanup.error) console.warn('Old puzzle piece cleanup failed after successful save', cleanup.error.message)
      }
      return data
    } catch (error) {
      if (uploadedMasks.length) {
        const current = await supabase.from('puzzle_pieces').select('mask_path').eq('image_id', img.id)
        if (current.error) {
          console.warn('Could not verify puzzle piece references; keeping uploaded files', current.error.message)
        } else {
          const referenced = new Set(((current.data ?? []) as { mask_path: string | null }[]).map((row) => row.mask_path).filter((path): path is string => !!path))
          const orphaned = uploadedMasks.filter((path) => !referenced.has(path))
          if (orphaned.length) {
            const cleanup = await supabase.storage.from('story-pieces').remove(orphaned)
            if (cleanup.error) console.warn('New puzzle piece cleanup failed', cleanup.error.message)
          }
        }
      }
      throw error
    }
  } finally { bitmap.close() }
}

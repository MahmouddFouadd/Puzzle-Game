import { supabase } from '../lib/supabase'
import { generatePuzzle, type PieceGeometry } from '../puzzle/engine'
import type { Story, StoryImage } from './types'

const MAX_BYTES = 15 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

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
  const { error } = await supabase.from('stories').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
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
  const { data, error } = await supabase.storage.from('story-originals').createSignedUrl(path, 3600)
  if (error || !data) throw new Error(error?.message ?? 'signed url failed')
  return data.signedUrl
}

export async function uploadImage(storyId: string, file: File, nextPosition: number): Promise<void> {
  const ext = TYPES[file.type]
  if (!ext) throw new Error('unsupported_type')
  if (file.size > MAX_BYTES) throw new Error('file_too_large')
  const bmp = await createImageBitmap(file)
  const { width, height } = bmp
  bmp.close()
  const path = `${storyId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from('story-originals').upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) throw new Error(up.error.message)
  const ins = await supabase.from('story_images').insert({
    story_id: storyId, position: nextPosition, title: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
    storage_path: path, width, height, piece_count: 12, puzzle_seed: Math.floor(Math.random() * 1_000_000)
  })
  if (ins.error) { await supabase.storage.from('story-originals').remove([path]); throw new Error(ins.error.message) }
}

export async function updateImage(id: string, patch: Partial<Pick<StoryImage, 'title' | 'description' | 'hint'>>): Promise<void> {
  const { error } = await supabase.from('story_images').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteImage(img: StoryImage): Promise<void> {
  const old = await supabase.from('puzzle_pieces').select('mask_path').eq('image_id', img.id)
  const { error } = await supabase.from('story_images').delete().eq('id', img.id)
  if (error) throw new Error(error.message)
  const masks = ((old.data ?? []) as { mask_path: string | null }[]).map((r) => r.mask_path).filter((p): p is string => !!p)
  await supabase.storage.from('story-originals').remove([img.storage_path])
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
  const blob = await (await fetch(await signedOriginalUrl(img.storage_path))).blob()
  const bitmap = await createImageBitmap(blob)
  try {
    if (bitmap.width !== img.width || bitmap.height !== img.height) throw new Error('image_size_mismatch')
    const old = await supabase.from('puzzle_pieces').select('mask_path').eq('image_id', img.id)
    const oldMasks = ((old.data ?? []) as { mask_path: string | null }[]).map((r) => r.mask_path).filter((p): p is string => !!p)

    const rows: { row: number; col: number; x: number; y: number; w: number; h: number; path: string; mask: string }[] = []
    let done = 0
    for (let i = 0; i < layout.pieces.length; i += 6) {
      await Promise.all(layout.pieces.slice(i, i + 6).map(async (p) => {
        const mask = `${img.id}/${seed}/${p.row}-${p.col}.png`
        const up = await supabase.storage.from('story-pieces').upload(mask, await renderPiecePng(bitmap, p), { contentType: 'image/png', upsert: true })
        if (up.error) throw new Error(up.error.message)
        rows.push({ row: p.row, col: p.col, x: p.bbox.x, y: p.bbox.y, w: p.bbox.w, h: p.bbox.h, path: p.path, mask })
        onProgress(++done, layout.pieces.length)
      }))
    }
    const { data, error } = await supabase.rpc('save_image_pieces', { p_image: img.id, p_seed: seed, p_pieces: rows, p_force: force })
    if (error) {
      await supabase.storage.from('story-pieces').remove(rows.map((r) => r.mask).filter((m) => !oldMasks.includes(m)))
      throw new Error(error.message)
    }
    const stale = oldMasks.filter((m) => !rows.some((r) => r.mask === m))
    if (stale.length) await supabase.storage.from('story-pieces').remove(stale)
    return data as number
  } finally { bitmap.close() }
}

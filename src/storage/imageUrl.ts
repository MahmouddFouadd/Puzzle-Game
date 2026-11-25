import { supabase } from '../lib/supabase'

export type ImageStorageBucket = 'story-originals' | 'story-pieces'

type ImageReference =
  | { kind: 'external'; url: string }
  | { kind: 'storage'; bucket: ImageStorageBucket; path: string }

const IMAGE_BUCKETS = new Set<ImageStorageBucket>(['story-originals', 'story-pieces'])
const STORAGE_OBJECT_ROUTE = /^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/

/** Classify a persisted image reference without making a network request. */
export function classifyImageReference(
  value: string,
  defaultBucket: ImageStorageBucket,
  supabaseUrl: string
): ImageReference {
  const reference = value.trim()
  if (!reference) throw new Error('invalid_image_reference')

  if (/^https?:\/\//i.test(reference)) {
    let url: URL
    try {
      url = new URL(reference)
    } catch {
      throw new Error('invalid_image_reference')
    }
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('invalid_image_reference')
    }

    let configuredOrigin = ''
    try { configuredOrigin = new URL(supabaseUrl).origin } catch { /* No configured Supabase URL. */ }
    if (configuredOrigin && url.origin === configuredOrigin) {
      const match = STORAGE_OBJECT_ROUTE.exec(url.pathname)
      if (match) {
        let bucket: string
        let path: string
        try {
          bucket = decodeURIComponent(match[1])
          path = decodeURIComponent(match[2])
        } catch {
          throw new Error('invalid_image_reference')
        }
        if (IMAGE_BUCKETS.has(bucket as ImageStorageBucket) && isSafeObjectPath(path)) {
          return { kind: 'storage', bucket: bucket as ImageStorageBucket, path }
        }
      }
    }

    // Other absolute HTTP(S) URLs are external references. Do not send them to Storage.
    return { kind: 'external', url: reference }
  }

  // Disallow protocol-relative and non-HTTP schemes instead of accidentally using them as keys.
  if (reference.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(reference)) {
    throw new Error('invalid_image_reference')
  }
  if (!isSafeObjectPath(reference)) throw new Error('invalid_storage_path')
  return { kind: 'storage', bucket: defaultBucket, path: reference }
}

function isSafeObjectPath(path: string): boolean {
  return Boolean(path) && !path.startsWith('/') && !path.includes('\\') &&
    !/[\u0000-\u001f\u007f?#]/.test(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * Return external HTTP(S) image URLs as-is. For bucket-relative keys or a Supabase Storage URL,
 * mint a fresh signed URL on every call so expired tokens are never reused from persisted data.
 */
export async function resolveImageUrl(
  reference: string,
  defaultBucket: ImageStorageBucket,
  expiresInSeconds = 3600
): Promise<string> {
  const classified = classifyImageReference(reference, defaultBucket, import.meta.env.VITE_SUPABASE_URL ?? '')
  if (classified.kind === 'external') return classified.url

  const { data, error } = await supabase.storage
    .from(classified.bucket)
    .createSignedUrl(classified.path, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'image_sign_failed')
  return data.signedUrl
}

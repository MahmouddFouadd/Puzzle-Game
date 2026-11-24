export const MAX_REQUEST_BYTES = 8192

/** Read a request body incrementally and stop once the UTF-8 byte limit is exceeded. */
export async function readRequestTextLimited(stream: ReadableStream<Uint8Array> | null, limitBytes = MAX_REQUEST_BYTES): Promise<string> {
  if (!stream) return ''
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limitBytes) {
        await reader.cancel('request_too_large')
        throw new Error('request_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

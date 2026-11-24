import { describe, expect, it } from 'vitest'
import { MAX_REQUEST_BYTES, readRequestTextLimited } from './request-limits'

function body(...parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(new TextEncoder().encode(part))
      controller.close()
    }
  })
}

describe('readRequestTextLimited', () => {
  it('reads chunked request bodies within the byte limit', async () => {
    await expect(readRequestTextLimited(body('{"x":', '"ok"}'))).resolves.toBe('{"x":"ok"}')
  })

  it('accepts a body exactly at the configured byte limit', async () => {
    const text = 'a'.repeat(MAX_REQUEST_BYTES)
    await expect(readRequestTextLimited(body(text))).resolves.toBe(text)
  })

  it('rejects chunked bodies once their combined byte count exceeds the limit', async () => {
    await expect(readRequestTextLimited(body('a'.repeat(MAX_REQUEST_BYTES - 1), 'bb'))).rejects.toThrow('request_too_large')
  })

  it('counts encoded bytes rather than JavaScript characters', async () => {
    await expect(readRequestTextLimited(body('éé'), 3)).rejects.toThrow('request_too_large')
  })

  it('rejects malformed UTF-8 instead of silently replacing bytes', async () => {
    const invalid = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close() }
    })
    await expect(readRequestTextLimited(invalid)).rejects.toThrow()
  })
})

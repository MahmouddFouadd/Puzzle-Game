/** Normalize what a person types: "diabc123", "DI abc123", "di-abc123" -> "DI-ABC123". */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return raw.length > 2 ? `${raw.slice(0, 2)}-${raw.slice(2, 8)}` : raw
}
export const isValidCode = (c: string): boolean => /^[A-Z0-9]{2,4}-[A-Z0-9]{6}$/.test(c)
export const joinUrl = (origin: string, code: string): string => `${origin}/join/${encodeURIComponent(code)}`
/** Whole seconds left until an ISO time (never negative). */
export function secondsLeft(endIso: string | null, nowMs: number): number {
  if (!endIso) return 0
  return Math.max(0, Math.ceil((Date.parse(endIso) - nowMs) / 1000))
}
export const teamNamesFromText = (text: string): string[] => text.split('\n').map((s) => s.trim()).filter(Boolean)

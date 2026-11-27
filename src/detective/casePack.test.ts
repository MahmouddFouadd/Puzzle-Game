import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM helper shared with the Node importer
import { normalizePack, packVersion, validatePack } from '../../scripts/detective-pack-lib.mjs'

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'))
const V1 = ['blue-ring-heist', 'clock-that-stopped', 'missing-180', 'blue-moonflower-seed']

describe('detective case packs', () => {
  it.each(V1)('existing v1 pack %s is still valid and keeps every field', (name) => {
    const pack = read(`supabase/seed/packs/${name}.json`)
    const boxes = read(`supabase/seed/packs/${name}.boxes.json`)
    expect(packVersion(pack)).toBe(1)
    expect(validatePack(pack, { boxes }).errors).toEqual([])
    const n = normalizePack(pack)
    for (const k of Object.keys(pack)) expect(n[k]).toEqual(pack[k])
    expect(n.lab_procedures).toEqual([])
    expect(n.verdict).toBeNull()
  })

  it('accepts the v2 fixture with lab, interrogation and verdict', () => {
    const pack = read('supabase/tests/fixtures/hybrid-mini.json')
    expect(packVersion(pack)).toBe(2)
    expect(validatePack(pack).errors).toEqual([])
  })

  it('reports broken references, bad hotspots and duplicate keys', () => {
    const pack = read('supabase/tests/fixtures/hybrid-mini.json')
    pack.scenes[0].evidence.push({ ...pack.scenes[0].evidence[0] })
    pack.scenes[0].evidence[1].x = 95
    pack.lab_procedures[0].evidence = 'nope'
    pack.confrontations[0].suspect = 'ghost'
    pack.verdict.motive = 'missing'
    pack.verdict.timeline = ['enter', 'teleport']
    const { errors } = validatePack(pack)
    expect(errors).toEqual(expect.arrayContaining([
      'duplicate evidence key knife', 'hotspot out of range for towel', 'lab blood-knife: unknown evidence nope',
      'confrontation: unknown suspect ghost', 'verdict: motive answer not in motives', 'verdict: unknown timeline event teleport'
    ]))
  })

  it('flags enabled stages without content and unknown versions', () => {
    const pack = read('supabase/tests/fixtures/hybrid-mini.json')
    pack.lab_procedures = []; delete pack.verdict
    expect(validatePack(pack).errors).toEqual(expect.arrayContaining(['settings enable VERDICT but no verdict criteria', 'settings enable LAB but there are no lab procedures']))
    expect(validatePack({ ...pack, pack_version: 9 }).errors).toEqual(['unsupported pack_version 9'])
  })

  it('checks images when an asset checker is given', () => {
    const pack = read('supabase/tests/fixtures/hybrid-mini.json')
    expect(validatePack(pack, { assetExists: (n: string) => n !== 'scene-1' }).errors).toContain('scene 1 image missing')
  })
})

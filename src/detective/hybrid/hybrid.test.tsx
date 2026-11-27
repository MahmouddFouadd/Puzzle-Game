import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
import { LabPanel } from './LabPanel'
import { VerdictPanel } from './VerdictPanel'
import { InterrogationPanel } from './InterrogationPanel'
import type { DetectiveEvidence, Investigation, LabProcedure } from '../api'

const ev = (id: string, t: string): DetectiveEvidence => ({ id, evidence_key: id, public_title: t, public_title_ar: `ع-${t}`, x: 1, y: 1, width: 5, height: 5, classification: 'FACT', importance: 3 })
const lab = (o: Partial<LabProcedure>): LabProcedure => ({ id: 'l1', key: 'k', exam_type: 'BLOOD', title: 'Blood', title_ar: 'دم', evidence_id: 'e1', available: true, status: null, ready_at: null, result: null, result_ar: null, report: null, ...o })
const verdict: NonNullable<Investigation['verdict']> = {
  enabled: true, evidence_max: 6, timeline_events: 2,
  motive_options: [{ id: 'm', text: 'Money', text_ar: 'فلوس' }], method_options: [{ id: 'k', text: 'Knife', text_ar: 'سكين' }], submitted: null
}
const suspects = [{ id: 's1', name: 'Sherif', name_ar: 'شريف', statements: [] }]

describe('hybrid detective panels', () => {
  it('lab: request button, locked sample, pending and ready states', () => {
    const html = renderToString(<LabPanel ar={false} busy={false} serverNow={new Date().toISOString()} found={[ev('e1', 'Knife')]} onRequest={() => {}} onRefresh={() => {}}
      lab={[lab({}), lab({ id: 'l2', available: false }), lab({ id: 'l3', status: 'PENDING', ready_at: new Date(Date.now() + 60000).toISOString() }), lab({ id: 'l4', status: 'READY', result: 'Match' })]} />)
    expect(html).toContain('Send to the lab')
    expect(html).toContain('Another sample from the scene is needed first')
    expect(html).toContain('Sample in the lab')
    expect(html).toContain('Open the report')
    expect(html).not.toContain('Match') // report stays closed until opened
  })
  it('lab: empty state', () => {
    expect(renderToString(<LabPanel ar busy={false} serverNow={new Date().toISOString()} found={[]} lab={[]} onRequest={() => {}} onRefresh={() => {}} />)).toContain('لسه مفيش عينات')
  })
  it('accusation: captain gets the submit button, members do not', () => {
    const common = { sessionId: 's', verdict, suspects, timeline: [], found: [ev('e1', 'Knife')], ar: false, busy: false, onSubmit: () => {} }
    expect(renderToString(<VerdictPanel {...common} captain />)).toContain('Submit the accusation')
    const member = renderToString(<VerdictPanel {...common} captain={false} />)
    expect(member).not.toContain('Submit the accusation')
    expect(member).toContain('Waiting for the team captain')
  })
  it('accusation: once submitted it is read-only and never shows a grade', () => {
    const html = renderToString(<VerdictPanel sessionId="s" verdict={{ ...verdict, submitted: { suspect_id: 's1', motive: 'm', method: 'k', evidence: ['e1'], timeline: [], explanation: null } }}
      captain suspects={suspects} timeline={[]} found={[ev('e1', 'Knife')]} ar={false} busy={false} onSubmit={() => {}} />)
    expect(html).toContain('Submitted'); expect(html).toContain('Sherif'); expect(html).not.toMatch(/\d+ \/ \d+|correct/i)
  })
  it('interrogation: suspect list in Arabic', () => {
    const html = renderToString(<InterrogationPanel suspects={suspects} extra={[]} confrontations={[]} found={[]} ar busy={false} imageUrl={(p) => p} onConfront={async () => null} />)
    expect(html).toContain('شريف'); expect(html).toContain('اختار مشتبه به')
  })
})

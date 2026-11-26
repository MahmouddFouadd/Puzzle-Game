import { describe, expect, it } from 'vitest'
import { createExcelTemplate, parseContentPackage } from './importer'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function fileFromBlob(blob: Blob, name: string): Promise<File> {
  return new File([new Uint8Array(await blob.arrayBuffer())], name, { type: blob.type })
}

async function samplePackage(options: { correctCount?: number; ageMin?: number; hint?: string } = {}): Promise<{ workbook: File; zip: File }> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const stories = workbook.addWorksheet('Stories')
  stories.addRow(['story_key','title','description','educational_objective','subject','age_min','age_max','difficulty','language','source_type','source_reference'])
  stories.addRow(['SCI001','رحلة علمية','قصة قصيرة','التعرف إلى الماء','science',options.ageMin ?? 7,9,2,'ar','MANUAL',''])

  const images = workbook.addWorksheet('Images')
  const withHint = options.hint !== undefined
  images.addRow(['image_key','story_key','image_order','filename','title','description','image_prompt', ...(withHint ? ['hint'] : [])])
  images.addRow(['IMG001','SCI001',1,'water.png','الماء','مشهد ماء','قطرات ماء', ...(withHint ? [options.hint] : [])])

  const questions = workbook.addWorksheet('Questions')
  questions.addRow(['question_key','image_key','question_type','question_text','correct_answer','explanation','difficulty','points'])
  questions.addRow(['Q001','IMG001','MCQ','ما حالة الماء؟','سائل','شرح بسيط',2,1])

  const choices = workbook.addWorksheet('Options')
  choices.addRow(['question_key','option_key','option_text','is_correct'])
  choices.addRow(['Q001','A','سائل',options.correctCount === 0 ? false : true])
  choices.addRow(['Q001','B','صخر',options.correctCount === 2 ? true : false])
  choices.addRow(['Q001','C','هواء',false])

  const metadata = workbook.addWorksheet('Metadata')
  metadata.addRow(['story_key','tags','license_type','attribution','notes'])
  metadata.addRow(['SCI001','علوم, ماء','UNKNOWN','','مراجعة المصدر'])

  const bytes = await workbook.xlsx.writeBuffer()
  const xlsx = new Uint8Array(bytes as ArrayBuffer)
  const workbookFile = new File([xlsx], 'content.xlsx', { type: XLSX_MIME })
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('content.xlsx', xlsx)
  zip.file('images/water.png', new Uint8Array([1, 2, 3, 4]))
  const zipBytes = await zip.generateAsync({ type: 'uint8array' })
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBuffer).set(zipBytes)
  return { workbook: workbookFile, zip: new File([zipBuffer], 'images.zip', { type: 'application/zip' }) }
}

describe('Content Studio workbook importer', () => {
  it('exports and accepts the required five-sheet template', async () => {
    const template = await fileFromBlob(await createExcelTemplate(), 'template.xlsx')
    const parsed = await parseContentPackage(template)
    expect(parsed.issues).toEqual([])
    expect(parsed.stories).toHaveLength(0)
    expect(parsed.validStories).toHaveLength(0)
  })

  it('validates a workbook with its ZIP image and expands the question options', async () => {
    const { workbook, zip } = await samplePackage()
    const parsed = await parseContentPackage(workbook, zip)
    expect(parsed.issues).toEqual([])
    expect(parsed.validStories).toHaveLength(1)
    expect(parsed.validStories[0].questions[0]).toMatchObject({
      type: 'MULTIPLE_CHOICE', answers: ['سائل'],
      options: [{ text: 'سائل', correct: true }, { text: 'صخر', correct: false }, { text: 'هواء', correct: false }]
    })
    expect(parsed.validStories[0].images[0].file).toBeInstanceOf(File)
    expect(parsed.validStories[0].tags).toEqual(['علوم', 'ماء'])
    expect(parsed.validStories[0].images[0].hint).toBe('')
  })

  it('keeps the optional per-image hint column', async () => {
    const { workbook, zip } = await samplePackage({ hint: '  ابحث عن شيء يتحرك بسهولة  ' })
    const parsed = await parseContentPackage(workbook, zip)
    expect(parsed.issues).toEqual([])
    expect(parsed.validStories[0].images[0].hint).toBe('ابحث عن شيء يتحرك بسهولة')
  })

  it('rejects image hints longer than 300 characters', async () => {
    const { workbook, zip } = await samplePackage({ hint: 'x'.repeat(301) })
    const parsed = await parseContentPackage(workbook, zip)
    expect(parsed.issues.some((i) => i.field === 'hint')).toBe(true)
    expect(parsed.validStories).toHaveLength(0)
  })

  it('rejects multiple-choice questions without exactly one correct option', async () => {
    const { workbook, zip } = await samplePackage({ correctCount: 2 })
    const parsed = await parseContentPackage(workbook, zip)
    expect(parsed.validStories).toHaveLength(0)
    expect(parsed.issues.some((item) => item.code === 'mcq_options')).toBe(true)
  })

  it('does not silently truncate fractional ages to integers', async () => {
    const { workbook, zip } = await samplePackage({ ageMin: 7.5 })
    const parsed = await parseContentPackage(workbook, zip)
    expect(parsed.validStories).toHaveLength(0)
    expect(parsed.issues.some((item) => item.code === 'age_range')).toBe(true)
  })
})

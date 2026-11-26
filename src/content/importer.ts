export interface ImportIssue { sheet: string; row: number; field?: string; code: string; message: string }
export interface ImportQuestion { question_key: string; image_key: string; type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT'; text: string; explanation: string; difficulty: number; options: Array<{ text: string; correct: boolean }>; answers: string[] }
export interface ImportImage { image_key: string; image_order: number; filename: string; title: string; description: string; image_prompt: string; hint: string; file: File | null }
export interface ImportStory {
  story_key: string; title: string; description: string; educational_objective: string; subject: string;
  age_min: number; age_max: number; difficulty: number; language: 'ar' | 'en'; source_type: 'IMPORT' | 'MANUAL' | 'AI';
  source_reference: string; license_type: string; attribution: string; notes: string; tags: string[];
  images: ImportImage[]; questions: ImportQuestion[]
}
export interface ParsedContentPackage { stories: ImportStory[]; validStories: ImportStory[]; invalidStoryKeys: string[]; issues: ImportIssue[] }

const REQUIRED: Record<string, string[]> = {
  Stories: ['story_key','title','subject','age_min','age_max','difficulty'],
  Images: ['image_key','story_key','image_order','filename'],
  Questions: ['question_key','image_key','question_type','question_text','correct_answer'],
  Options: ['question_key','option_key','option_text','is_correct'],
  Metadata: ['story_key','tags','license_type','attribution','notes']
}
const MAX_XLSX_BYTES = 10 * 1024 * 1024
const MAX_ZIP_BYTES = 50 * 1024 * 1024
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_ZIP_ENTRIES = 500
const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

type RawRow = Record<string, string>
const norm = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_')

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  // Excel formula, rich text, hyperlinks, and arbitrary objects are not imported as values.
  return ''
}

function toRows(sheet: { rowCount: number; getRow: (n: number) => { getCell: (n: number) => { value: unknown } } }): { headers: string[]; rows: Array<{ row: number; value: RawRow }> } {
  const headerRow = sheet.getRow(1)
  const headers: string[] = []
  for (let col = 1; col <= 100; col++) {
    const header = norm(cellText(headerRow.getCell(col).value))
    if (header) headers[col] = header
  }
  const rows: Array<{ row: number; value: RawRow }> = []
  for (let row = 2; row <= sheet.rowCount; row++) {
    const raw: RawRow = {}
    let nonEmpty = false
    for (let col = 1; col < headers.length; col++) {
      const name = headers[col]
      if (!name) continue
      const value = cellText(sheet.getRow(row).getCell(col).value)
      raw[name] = value
      if (value) nonEmpty = true
    }
    if (nonEmpty) rows.push({ row, value: raw })
  }
  return { headers, rows }
}

function numberValue(value: string, fallback: number): number {
  if (!value.trim()) return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : Number.NaN
}
function boolValue(value: string): boolean | null {
  const v = value.trim().toLowerCase()
  if (['true','1','yes','y'].includes(v)) return true
  if (['false','0','no','n'].includes(v)) return false
  return null
}
function basename(name: string): string { return name.replace(/\\/g, '/').split('/').pop()?.trim().toLowerCase() ?? '' }
function issue(issues: ImportIssue[], sheet: string, row: number, field: string, code: string, message: string) {
  issues.push({ sheet, row, field, code, message })
}

async function readZip(file: File): Promise<{ xlsx: ArrayBuffer | null; images: Map<string, File>; issues: ImportIssue[] }> {
  const issues: ImportIssue[] = []
  if (file.size > MAX_ZIP_BYTES) return { xlsx: null, images: new Map(), issues: [{ sheet: 'Package', row: 0, code: 'zip_too_large', message: 'ZIP exceeds the 50 MB compressed limit.' }] }
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file, { checkCRC32: false, createFolders: false })
  const names = Object.keys(zip.files)
  if (names.length > MAX_ZIP_ENTRIES) return { xlsx: null, images: new Map(), issues: [{ sheet: 'Package', row: 0, code: 'too_many_entries', message: 'ZIP contains too many entries.' }] }
  const normalized = names.map((name) => name.replace(/\\/g, '/'))
  if (normalized.some((name) => name.startsWith('/') || name.split('/').some((part) => part === '..'))) {
    return { xlsx: null, images: new Map(), issues: [{ sheet: 'Package', row: 0, code: 'unsafe_path', message: 'ZIP contains an unsafe path.' }] }
  }
  const xlsxName = names.find((name) => name.toLowerCase() === 'content.xlsx') ?? names.find((name) => name.toLowerCase().endsWith('.xlsx') && !name.includes('/'))
  let xlsx: ArrayBuffer | null = null
  if (xlsxName) {
    const entry = zip.files[xlsxName] as typeof zip.files[string] & { _data?: { uncompressedSize?: number } }
    const declared = entry._data?.uncompressedSize ?? 0
    if (declared > MAX_XLSX_BYTES) issues.push({ sheet: 'Package', row: 0, code: 'workbook_too_large', message: 'Workbook exceeds the 10 MB unpacked limit.' })
    else xlsx = await entry.async('arraybuffer')
  }
  let unpacked = xlsx?.byteLength ?? 0
  const images = new Map<string, File>()
  for (const name of names) {
    const entry = zip.files[name]
    if (entry.dir || name === xlsxName) continue
    const ext = basename(name).split('.').pop() ?? ''
    const mime = IMAGE_MIME[ext]
    if (!mime) continue
    const unsafeEntry = entry as typeof entry & { _data?: { uncompressedSize?: number } }
    const declared = unsafeEntry._data?.uncompressedSize ?? 0
    if (declared <= 0 || declared > MAX_IMAGE_BYTES) {
      issue(issues, 'Package', 0, name, 'image_size_limit', 'Image is empty or exceeds 15 MB.')
      continue
    }
    unpacked += declared
    if (unpacked > MAX_UNPACKED_BYTES) {
      issue(issues, 'Package', 0, name, 'unpacked_limit', 'ZIP exceeds the 100 MB expanded limit.')
      break
    }
    const bytes = await entry.async('uint8array')
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      issue(issues, 'Package', 0, name, 'image_size_limit', 'Image exceeds 15 MB after decompression.')
      continue
    }
    const key = basename(name)
    if (images.has(key)) { issue(issues, 'Package', 0, name, 'duplicate_filename', 'ZIP contains duplicate image filenames.'); continue }
    const imageBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(imageBuffer).set(bytes)
    images.set(key, new File([imageBuffer], key, { type: mime }))
  }
  return { xlsx, images, issues }
}

export async function createExcelTemplate(): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheets: Array<[string, string[]]> = [
    ['Stories',['story_key','title','description','educational_objective','subject','age_min','age_max','difficulty','language','source_type','source_reference']],
    ['Images',['image_key','story_key','image_order','filename','title','description','image_prompt','hint']],
    ['Questions',['question_key','image_key','question_type','question_text','correct_answer','explanation','difficulty','points']],
    ['Options',['question_key','option_key','option_text','is_correct']],
    ['Metadata',['story_key','tags','license_type','attribution','notes']]
  ]
  for (const [name, headers] of sheets) {
    const sheet = workbook.addWorksheet(name)
    sheet.addRow(headers)
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18343A' } }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
    sheet.columns = headers.map((header) => ({ key: header, width: Math.max(16, Math.min(34, header.length + 3)) }))
  }
  const data = await workbook.xlsx.writeBuffer()
  return new Blob([new Uint8Array(data as ArrayBuffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function parseContentPackage(workbookFile: File, zipFile?: File | null): Promise<ParsedContentPackage> {
  let workbookBuffer: ArrayBuffer
  let images = new Map<string, File>()
  const issues: ImportIssue[] = []
  if (workbookFile.size > MAX_ZIP_BYTES) return { stories: [], validStories: [], invalidStoryKeys: [], issues: [{ sheet: 'Workbook', row: 0, code: 'file_too_large', message: 'File exceeds the 50 MB limit.' }] }
  if (workbookFile.name.toLowerCase().endsWith('.zip')) {
    const packageData = await readZip(workbookFile)
    workbookBuffer = packageData.xlsx ?? new ArrayBuffer(0)
    images = packageData.images
    issues.push(...packageData.issues)
    if (!packageData.xlsx) issues.push({ sheet: 'Package', row: 0, code: 'workbook_missing', message: 'ZIP package must contain content.xlsx at its root.' })
  } else {
    if (workbookFile.size > MAX_XLSX_BYTES) return { stories: [], validStories: [], invalidStoryKeys: [], issues: [{ sheet: 'Workbook', row: 0, code: 'workbook_too_large', message: 'Workbook exceeds the 10 MB limit.' }] }
    workbookBuffer = await workbookFile.arrayBuffer()
    if (zipFile) {
      const packageData = await readZip(zipFile)
      images = packageData.images
      issues.push(...packageData.issues)
    }
  }
  if (workbookBuffer.byteLength === 0) return { stories: [], validStories: [], invalidStoryKeys: [], issues }

  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(workbookBuffer)
  if (workbook.worksheets.length > 10) return { stories: [], validStories: [], invalidStoryKeys: [], issues: [...issues, { sheet: 'Workbook', row: 0, code: 'too_many_sheets', message: 'Workbook has too many worksheets.' }] }
  const sheetRows = new Map<string, ReturnType<typeof toRows>>()
  for (const [name, required] of Object.entries(REQUIRED)) {
    const worksheet = workbook.getWorksheet(name)
    if (!worksheet) { issues.push({ sheet: name, row: 1, code: 'sheet_missing', message: `Required sheet "${name}" is missing.` }); continue }
    if (worksheet.rowCount > 20002) { issues.push({ sheet: name, row: 0, code: 'too_many_rows', message: `Sheet "${name}" exceeds the row limit.` }); continue }
    const rows = toRows(worksheet)
    sheetRows.set(name, rows)
    const headerNames = rows.headers.filter(Boolean)
    if (new Set(headerNames).size !== headerNames.length) issue(issues, name, 1, '', 'duplicate_column', 'Column names must be unique.')
    for (const header of required) if (!rows.headers.includes(header)) issue(issues, name, 1, header, 'column_missing', `Required column "${header}" is missing.`)
  }
  const storiesRows = sheetRows.get('Stories')?.rows ?? []
  if (storiesRows.length > 500) issue(issues, 'Stories', 0, '', 'story_limit', 'A workbook may contain at most 500 stories.')
  const imagesRows = sheetRows.get('Images')?.rows ?? []
  const questionRows = sheetRows.get('Questions')?.rows ?? []
  const optionRows = sheetRows.get('Options')?.rows ?? []
  const metadataRows = sheetRows.get('Metadata')?.rows ?? []
  const questionKeySet = new Set(questionRows.map(({ value }) => value.question_key.trim()).filter(Boolean))
  const stories = new Map<string, ImportStory>()
  const storyRowNumber = new Map<string, number>()
  for (const { row, value } of storiesRows) {
    const key = value.story_key.trim()
    if (!key) { issue(issues, 'Stories', row, 'story_key', 'required', 'Story key is required.'); continue }
    if (stories.has(key)) { issue(issues, 'Stories', row, 'story_key', 'duplicate_key', 'Story key must be unique.'); continue }
    const ageMin = numberValue(value.age_min, Number.NaN); const ageMax = numberValue(value.age_max, Number.NaN)
    const difficulty = numberValue(value.difficulty, 1)
    if (!value.title || value.title.length > 120) issue(issues, 'Stories', row, 'title', 'required_or_too_long', 'Title is required and must not exceed 120 characters.')
    if (!value.subject) issue(issues, 'Stories', row, 'subject', 'required', 'Subject is required.')
    if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 0 || ageMax > 99 || ageMin > ageMax) issue(issues, 'Stories', row, 'age_min/age_max', 'age_range', 'Enter a valid age range from 0 to 99.')
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) issue(issues, 'Stories', row, 'difficulty', 'difficulty', 'Difficulty must be an integer from 1 to 5.')
    if (key.length > 80 || !/^[A-Za-z0-9_-]+$/.test(key)) issue(issues, 'Stories', row, 'story_key', 'story_key_format', 'Story keys may contain only letters, numbers, underscore and hyphen, up to 80 characters.')
    const lang = value.language.trim().toLowerCase() || 'ar'
    if (lang !== 'ar' && lang !== 'en') issue(issues, 'Stories', row, 'language', 'language', 'Language must be ar or en.')
    stories.set(key, {
      story_key: key, title: value.title, description: value.description, educational_objective: value.educational_objective,
      subject: value.subject, age_min: ageMin, age_max: ageMax, difficulty, language: lang === 'en' ? 'en' : 'ar',
      source_type: value.source_type === 'AI' || value.source_type === 'MANUAL' ? value.source_type : 'IMPORT',
      source_reference: value.source_reference, license_type: 'UNKNOWN', attribution: '', notes: '', tags: [], images: [], questions: []
    })
    storyRowNumber.set(key, row)
  }

  const imageKeys = new Set<string>()
  const imageOrders = new Map<string, Set<number>>()
  for (const { row, value } of imagesRows) {
    const story = stories.get(value.story_key.trim())
    if (!story) { issue(issues, 'Images', row, 'story_key', 'unknown_story', 'Image references a missing story_key.'); continue }
    const key = value.image_key.trim()
    const filename = basename(value.filename)
    if (!key || imageKeys.has(key)) { issue(issues, 'Images', row, 'image_key', 'duplicate_or_empty_key', 'Image key must be present and unique.'); continue }
    if (!filename) { issue(issues, 'Images', row, 'filename', 'required', 'Image filename is required.'); continue }
    const image: ImportImage = { image_key: key, image_order: numberValue(value.image_order, story.images.length + 1), filename, title: value.title, description: value.description, image_prompt: value.image_prompt, hint: (value.hint ?? '').trim(), file: images.get(filename) ?? null }
    if (!Number.isInteger(image.image_order) || image.image_order < 1) issue(issues, 'Images', row, 'image_order', 'image_order', 'Image order must be a positive integer.')
    const orderSet = imageOrders.get(story.story_key) ?? new Set<number>()
    if (orderSet.has(image.image_order)) issue(issues, 'Images', row, 'image_order', 'duplicate_image_order', 'Image order must be unique within a story.')
    orderSet.add(image.image_order); imageOrders.set(story.story_key, orderSet)
    if (image.hint.length > 300) issue(issues, 'Images', row, 'hint', 'too_long', 'Image hint must not exceed 300 characters.')
    if (!image.file) issue(issues, 'Images', row, 'filename', 'image_missing', `Image "${filename}" is missing from the ZIP package.`)
    imageKeys.add(key); story.images.push(image)
  }
  for (const story of stories.values()) story.images.sort((a,b) => a.image_order - b.image_order)
  const imageByKey = new Map(Array.from(stories.values()).flatMap((story) => story.images.map((image) => [image.image_key, image] as const)))
  const storyByImageKey = new Map(Array.from(stories.values()).flatMap((story) => story.images.map((image) => [image.image_key, story] as const)))

  const optionsByQuestion = new Map<string, Array<{ key: string; text: string; correct: boolean }>>()
  for (const { row, value } of optionRows) {
    const questionKey = value.question_key.trim()
    if (!questionKey || !value.option_text) { issue(issues, 'Options', row, 'option_text', 'required', 'Question key and option text are required.'); continue }
    if (!questionKeySet.has(questionKey)) issue(issues, 'Options', row, 'question_key', 'unknown_question', 'Option references a missing question_key.')
    const correct = boolValue(value.is_correct)
    if (correct === null) { issue(issues, 'Options', row, 'is_correct', 'boolean', 'is_correct must be TRUE or FALSE.'); continue }
    const list = optionsByQuestion.get(questionKey) ?? []
    list.push({ key: value.option_key, text: value.option_text, correct }); optionsByQuestion.set(questionKey, list)
  }
  const questionKeys = new Set<string>()
  for (const { row, value } of questionRows) {
    const key = value.question_key.trim()
    if (!key || questionKeys.has(key)) { issue(issues, 'Questions', row, 'question_key', 'duplicate_or_empty_key', 'Question key must be present and unique.'); continue }
    questionKeys.add(key)
    const image = imageByKey.get(value.image_key.trim())
    if (!image) { issue(issues, 'Questions', row, 'image_key', 'unknown_image', 'Question references a missing image_key.'); continue }
    const typeValue = value.question_type.trim().toUpperCase()
    const type = typeValue === 'MCQ' ? 'MULTIPLE_CHOICE' : typeValue
    if (!['MULTIPLE_CHOICE','TRUE_FALSE','SHORT_TEXT'].includes(type)) { issue(issues, 'Questions', row, 'question_type', 'question_type', 'Supported types: MCQ, TRUE_FALSE, SHORT_TEXT.'); continue }
    if (!value.question_text) issue(issues, 'Questions', row, 'question_text', 'required', 'Question text is required.')
    let options: ImportQuestion['options'] = []; let answers: string[] = []
    if (type === 'MULTIPLE_CHOICE') {
      options = (optionsByQuestion.get(key) ?? []).map((o) => ({ text: o.text, correct: o.correct }))
      if (options.length < 2 || options.length > 8 || options.filter((o) => o.correct).length !== 1) issue(issues, 'Questions', row, 'options', 'mcq_options', 'Multiple-choice questions require 2–8 options and exactly one correct option.')
      const right = options.find((o) => o.correct)
      answers = right ? [right.text] : []
    } else if (type === 'TRUE_FALSE') {
      const normalized = value.correct_answer.trim().toLowerCase()
      const tf = ['true','1','yes','صح','صحيح'].includes(normalized) ? 'true' : ['false','0','no','خطأ','خاطئ'].includes(normalized) ? 'false' : ''
      if (!tf) issue(issues, 'Questions', row, 'correct_answer', 'true_false_answer', 'TRUE_FALSE answer must be true/false (صح/خطأ).')
      answers = tf ? [tf] : []
    } else {
      answers = value.correct_answer.split('|').map((part) => part.trim()).filter(Boolean)
      if (!answers.length || answers.length > 20) issue(issues, 'Questions', row, 'correct_answer', 'short_text_answers', 'SHORT_TEXT requires 1–20 accepted answers separated by |.')
    }
    const parentStory = storyByImageKey.get(image.image_key)
    const questionDifficulty = numberValue(value.difficulty, parentStory?.difficulty ?? 1)
    if (!Number.isInteger(questionDifficulty) || questionDifficulty < 1 || questionDifficulty > 5) issue(issues, 'Questions', row, 'difficulty', 'difficulty', 'Question difficulty must be an integer from 1 to 5.')
    if (parentStory) parentStory.questions.push({ question_key: key, image_key: image.image_key, type: type as ImportQuestion['type'], text: value.question_text, explanation: value.explanation, difficulty: questionDifficulty, options, answers })
  }
  const metadataByStory = new Map<string, RawRow>()
  for (const { row, value } of metadataRows) {
    const storyKey = value.story_key.trim()
    if (!stories.has(storyKey)) { issue(issues, 'Metadata', row, 'story_key', 'unknown_story', 'Metadata references a missing story_key.'); continue }
    if (metadataByStory.has(storyKey)) { issue(issues, 'Metadata', row, 'story_key', 'duplicate_key', 'Only one metadata row is allowed per story.'); continue }
    metadataByStory.set(storyKey, value)
  }
  for (const [key, story] of stories) {
    const meta = metadataByStory.get(key)
    if (meta) { story.tags = meta.tags.split(',').map((v) => v.trim()).filter(Boolean); story.license_type = meta.license_type || 'UNKNOWN'; story.attribution = meta.attribution; story.notes = meta.notes }
    if (story.images.length < 1 || story.images.length > 20) issue(issues, 'Stories', storyRowNumber.get(key) ?? 0, 'images', 'image_count', 'A story requires 1–20 images; 3–5 are recommended.')
  }
  const allStories = Array.from(stories.values())
  const storyByImage = new Map(allStories.flatMap((story) => story.images.map((image) => [image.image_key, story.story_key] as const)))
  const imageKeyByQuestion = new Map(questionRows.map(({ value }) => [value.question_key.trim(), value.image_key.trim()] as const))
  const storyByMetadataRow = new Map(metadataRows.map(({ row, value }) => [row, value.story_key.trim()] as const))
  const storyByImageRow = new Map(imagesRows.map(({ row, value }) => [row, value.story_key.trim()] as const))
  const storyByQuestionRow = new Map(questionRows.map(({ row, value }) => [row, storyByImage.get(value.image_key.trim()) ?? ''] as const))
  const storyByOptionRow = new Map(optionRows.map(({ row, value }) => [row, storyByImage.get(imageKeyByQuestion.get(value.question_key.trim()) ?? '') ?? ''] as const))
  const storyByStoryRow = new Map(storiesRows.map(({ row, value }) => [row, value.story_key.trim()] as const))
  const invalidKeys = new Set<string>()
  let packageWideError = false
  for (const item of issues) {
    if (item.row === 0 || item.sheet === 'Package' || item.sheet === 'Workbook') { packageWideError = true; continue }
    const key = item.sheet === 'Stories' ? storyByStoryRow.get(item.row)
      : item.sheet === 'Images' ? storyByImageRow.get(item.row)
      : item.sheet === 'Questions' ? storyByQuestionRow.get(item.row)
      : item.sheet === 'Options' ? storyByOptionRow.get(item.row)
      : item.sheet === 'Metadata' ? storyByMetadataRow.get(item.row) : undefined
    if (key) invalidKeys.add(key)
  }
  const validStories = packageWideError ? [] : allStories.filter((story) => !invalidKeys.has(story.story_key))
  return { stories: allStories, validStories, invalidStoryKeys: packageWideError ? allStories.map((s) => s.story_key) : Array.from(invalidKeys), issues }
}

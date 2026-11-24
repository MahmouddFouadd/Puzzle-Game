import { supabase } from '../lib/supabase'
import { draftPayload } from './draft'
import type { Mapping, Piece, QuestionDraft, QuestionRow, Validation } from './types'

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  if (r.data === null) throw new Error('empty response')
  return r.data
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function listQuestions(storyId: string): Promise<QuestionRow[]> {
  return must(await supabase.from('questions')
    .select('*, question_options(id,position,text), accepted_answers(id,answer_text,option_id,is_primary)')
    .eq('story_id', storyId).order('created_at')) as unknown as QuestionRow[]
}
export const saveQuestion = (storyId: string, d: QuestionDraft) =>
  rpc<string>('save_question', { p_story: storyId, p_id: d.id ?? null, p: draftPayload(d) })
export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
export async function listPieces(storyId: string): Promise<Piece[]> {
  return must(await supabase.from('puzzle_pieces').select('id,image_id,row_idx,col_idx, story_images!inner(story_id)')
    .eq('story_images.story_id', storyId)) as unknown as Piece[]
}
export async function listMappings(storyId: string): Promise<Mapping[]> {
  return must(await supabase.from('question_piece_mappings').select('question_id,piece_id,suggested_by_system,approved, questions!inner(story_id)')
    .eq('questions.story_id', storyId)) as unknown as Mapping[]
}
export const setMapping = (questionId: string, pieceId: string | null) => rpc<void>('set_question_mapping', { p_question: questionId, p_piece: pieceId, p_suggested: false })
export const applySuggestions = (storyId: string, pairs: { question: string; piece: string }[]) => rpc<number>('apply_suggested_mappings', { p_story: storyId, p_pairs: pairs })
export const approveAll = (storyId: string) => rpc<number>('approve_mappings', { p_story: storyId })
export const validateStory = (storyId: string) => rpc<Validation>('validate_story', { p_story: storyId })
export const publishStory = (storyId: string) => rpc<void>('publish_story', { p_story: storyId })
export const setStoryStatus = (storyId: string, status: 'DRAFT' | 'ARCHIVED') => rpc<void>('set_story_status', { p_story: storyId, p_status: status })

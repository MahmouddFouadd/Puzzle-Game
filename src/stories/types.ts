export interface Story {
  id: string; title: string; description: string | null; category: string | null; subject: string | null
  difficulty: number; language: 'en' | 'ar'; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; created_at: string
}
export interface StoryImage {
  id: string; story_id: string; position: number; title: string; description: string | null; hint: string | null
  storage_path: string; width: number; height: number; piece_count: number; puzzle_seed: number
}

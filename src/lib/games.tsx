import type { ReactNode } from 'react'
import { DetectiveArt, PuzzleBookArt, SpyArt } from '../components/GameArt'

export type GameTag = 'party' | 'puzzle' | 'mystery' | 'learning' | 'teams'
export interface GameInfo {
  id: 'story' | 'bakasa' | 'detective'
  title: [string, string]; tagline: [string, string]; description: [string, string]
  how: [string, string][]; players: string; minutes: string
  tags: GameTag[]; gradient: string; glow: string
  art: (className?: string) => ReactNode
  play: { to: string; label: [string, string] }
  more: { to: string; label: [string, string]; icon: string }[]
}

export const TAGS: { id: GameTag | 'all'; icon: string; label: [string, string] }[] = [
  { id: 'all', icon: '✨', label: ['الكل', 'All'] }, { id: 'party', icon: '🎉', label: ['حفلات', 'Party'] },
  { id: 'puzzle', icon: '🧩', label: ['ألغاز', 'Puzzle'] }, { id: 'mystery', icon: '🔍', label: ['تحقيق', 'Mystery'] },
  { id: 'learning', icon: '📚', label: ['تعليمي', 'Learning'] }, { id: 'teams', icon: '👥', label: ['فرق', 'Teams'] }
]

export const GAMES: GameInfo[] = [
  {
    id: 'bakasa', title: ['بكاسة – مين البِكس؟', 'Bakasa – Hidden Spy'], tagline: ['لعبة الحفلات والخداع', 'The party deception game'],
    description: ['كل اللاعبين عارفين الكلمة السرية… ما عدا البِكس. ادّوا تلميحات ذكية، وصوّتوا، واكشفوه قبل ما يعرف الكلمة!',
      'Everyone knows the secret word… except the spy. Give clever clues, vote, and unmask them before they guess it!'],
    how: [['كل لاعب بياخد دوره في السر', 'Everyone gets a secret role'], ['كل واحد يدّي تلميح في دوره', 'Take turns giving clues'],
      ['صوّتوا على مين البِكس', 'Vote for the spy'], ['لو اتكشف، عنده فرصة أخيرة يخمّن', 'If caught, the spy gets one last guess']],
    players: '3–20', minutes: '~10', tags: ['party', 'teams'], gradient: 'linear-gradient(160deg, #ff8a3d 0%, #ff5f6d 100%)', glow: '#ff6a3d',
    art: (c) => <SpyArt className={c} />, play: { to: '/bakasa', label: ['العب دلوقتي', 'Play now'] },
    more: [{ to: '/bakasa/create', label: ['اعمل غرفة أونلاين', 'Create online room'], icon: '🌐' }, { to: '/bakasa/local', label: ['العب على موبايل واحد', 'Play on one phone'], icon: '📱' },
      { to: '/bakasa/join', label: ['ادخل غرفة بالكود', 'Join with a code'], icon: '🔑' }]
  },
  {
    id: 'story', title: ['أحجية الحكاية', 'Story Puzzle'], tagline: ['جاوب واكشف الصورة', 'Answer and reveal the picture'],
    description: ['ادخل غرفة مع فريقك، اسحب بطاقات الأدلة، جاوب صح عشان تكسب قطع الأحجية، وكمّل صورة الحكاية قبل الفرق التانية.',
      'Join a room with your team, draw clue cards, answer correctly to win puzzle pieces, and complete the story picture first.'],
    how: [['ادخل برمز الغرفة', 'Join with the room code'], ['اختار صورتك مع الفريق', 'Pick your picture with your team'],
      ['جاوب على البطاقات واكسب القطع', 'Answer cards to win pieces'], ['أول فريق يكمّل الصورة يكسب', 'First team to finish wins']],
    players: '2–40', minutes: '~20', tags: ['puzzle', 'learning', 'teams'], gradient: 'linear-gradient(160deg, #3dc5ff 0%, #3b5bff 100%)', glow: '#3b82f6',
    art: (c) => <PuzzleBookArt className={c} />, play: { to: '/join', label: ['ادخل غرفة', 'Join a room'] }, more: []
  },
  {
    id: 'detective', title: ['المحقق', 'Detective'], tagline: ['كل تفصيلة ممكن تكون دليل', 'Every detail could be a clue'],
    description: ['افحص مسرح القضية، اكتشف الأدلة المخفية، جاوب على أسئلة التحقيق، وابني استنتاجك خطوة بخطوة.',
      'Inspect the scene, discover hidden evidence, answer investigation questions and build your conclusion step by step.'],
    how: [['اختار قضية', 'Pick a case'], ['افحص الصورة واضغط على الأدلة', 'Inspect the scene and tap evidence'],
      ['جاوب على أسئلة التحقيق', 'Answer the investigation questions'], ['اكسب النقاط بالاستنتاج الصح', 'Score with the right deductions']],
    players: '1+', minutes: '~15', tags: ['mystery', 'learning', 'puzzle'], gradient: 'linear-gradient(160deg, #2dd4bf 0%, #0f766e 100%)', glow: '#14b8a6',
    art: (c) => <DetectiveArt className={c} />, play: { to: '/detective', label: ['افتح القضايا', 'Open cases'] }, more: []
  }
]
export const gameById = (id: string | undefined) => GAMES.find((g) => g.id === id)

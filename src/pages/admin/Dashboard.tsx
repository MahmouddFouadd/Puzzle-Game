import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'
import { Avatar } from '../../bakasa/ui'
import { DetectiveArt, PuzzleBookArt, SpyArt } from '../../components/GameArt'

interface Kpis {
  generated_at: string; days: number
  users: { total: number; guests: number; registered: number; new_7d: number; active_24h: number; admins: number }
  story: { stories: number; published: number; drafts: number; images: number; pieces: number; questions: number; rooms: number; rooms_live: number; rooms_finished: number; teams: number }
  bakasa: { rooms: number; rooms_live: number; rounds: number; spy_wins: number; player_wins: number; players: number; words: number; categories: number
    top_categories: { name_ar: string; name_en: string; emoji: string; color: string; rounds: number }[] }
  detective: { cases: number; published: number; sessions: number; completed: number; avg_score: number | null; avg_minutes: number | null; solved: number; hints: number; discoveries: number }
  series: { day: string; users: number; story: number; bakasa: number; detective: number }[]
  top_bakasa: { name: string; avatar: string; score: number; matches: number }[]
  top_detectives: { name: string; score: number; solved: number }[]
  activity: { kind: string; label: string; at: string }[]
}
const SERIES = [
  { k: 'story', color: '#3b82f6', ar: 'أحجية', en: 'Puzzle' }, { k: 'bakasa', color: '#ff6a3d', ar: 'بكاسة', en: 'Bakasa' },
  { k: 'detective', color: '#14b8a6', ar: 'المحقق', en: 'Detective' }, { k: 'users', color: '#a78bfa', ar: 'لاعبين جدد', en: 'New players' }
] as const

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values)
  return <svg viewBox={`0 0 ${values.length * 6} 24`} className="mt-2 h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
    {values.map((v, i) => <rect key={i} x={i * 6 + 1} y={24 - (v / max) * 22 - 1} width="4" height={(v / max) * 22 + 1} rx="1.5" fill={color} opacity={0.35 + (i / values.length) * 0.65} />)}
  </svg>
}

function Donut({ a, b, colors, label }: { a: number; b: number; colors: [string, string]; label: string }) {
  const total = a + b, pct = total ? a / total : 0, R = 34, C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 90 90" className="h-28 w-28" role="img" aria-label={label}>
      <circle cx="45" cy="45" r={R} fill="none" stroke={total ? colors[1] : '#2a2a36'} strokeWidth="12" />
      {total > 0 && <circle cx="45" cy="45" r={R} fill="none" stroke={colors[0]} strokeWidth="12" strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 45 45)" strokeLinecap="round" />}
      <text x="45" y="50" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">{total ? `${Math.round(pct * 100)}%` : '—'}</text>
    </svg>
  )
}

export default function Dashboard() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [k, setK] = useState<Kpis | null>(null)
  const [error, setError] = useState(false)
  const [days, setDays] = useState(14)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const load = useCallback(() => {
    supabase.rpc('admin_kpis', { p_days: days }).then(({ data, error: err }) => { if (err || !data) setError(true); else { setK(data as Kpis); setError(false) } })
  }, [days])
  useEffect(() => { load(); const id = window.setInterval(load, 60_000); return () => window.clearInterval(id) }, [load])
  const maxDay = useMemo(() => Math.max(1, ...(k?.series ?? []).map((d) => SERIES.filter((s) => !hidden.has(s.k)).reduce((n, s) => n + d[s.k], 0))), [k, hidden])

  if (error) return <div className="card space-y-2"><p role="alert" className="text-[#ff8a8d]">{ar ? 'مقدرناش نحمّل المؤشرات.' : 'Could not load KPIs.'}</p><button className="btn-primary" type="button" onClick={load}>{ar ? 'حاول تاني' : 'Retry'}</button></div>
  if (!k) return <p role="status">{ar ? 'بنجمع الأرقام…' : 'Crunching the numbers…'}</p>
  const sp = (key: keyof Kpis['series'][number]) => k.series.map((d) => Number(d[key]))
  const hour = new Date().getHours()
  const kpis = [
    { label: ar ? 'إجمالي اللاعبين' : 'Total players', value: k.users.total, sub: ar ? `+${k.users.new_7d} آخر 7 أيام` : `+${k.users.new_7d} last 7 days`, icon: '👥', glow: 'rgba(167,139,250,.35)', spark: sp('users'), color: '#a78bfa' },
    { label: ar ? 'نشطين آخر 24 ساعة' : 'Active last 24h', value: k.users.active_24h, sub: ar ? `${k.users.guests} ضيف · ${k.users.registered} مسجل` : `${k.users.guests} guests · ${k.users.registered} registered`, icon: '⚡', glow: 'rgba(34,197,94,.3)', spark: sp('users'), color: '#22c55e' },
    { label: ar ? 'جولات بكاسة' : 'Bakasa rounds', value: k.bakasa.rounds, sub: ar ? `${k.bakasa.rooms_live} غرفة شغالة دلوقتي` : `${k.bakasa.rooms_live} rooms live now`, icon: '🕵️', glow: 'rgba(255,106,61,.35)', spark: sp('bakasa'), color: '#ff6a3d' },
    { label: ar ? 'تحقيقات المحقق' : 'Detective runs', value: k.detective.sessions, sub: ar ? `${k.detective.completed} اكتملت` : `${k.detective.completed} completed`, icon: '🔍', glow: 'rgba(20,184,166,.35)', spark: sp('detective'), color: '#14b8a6' },
    { label: ar ? 'غرف الأحجية' : 'Puzzle rooms', value: k.story.rooms, sub: ar ? `${k.story.rooms_live} شغالة · ${k.story.teams} فريق` : `${k.story.rooms_live} live · ${k.story.teams} teams`, icon: '🧩', glow: 'rgba(59,130,246,.35)', spark: sp('story'), color: '#3b82f6' },
    { label: ar ? 'قصص منشورة' : 'Published stories', value: `${k.story.published}/${k.story.stories}`, sub: ar ? `${k.story.questions} سؤال · ${k.story.pieces} قطعة` : `${k.story.questions} questions · ${k.story.pieces} pieces`, icon: '📚', glow: 'rgba(245,166,35,.3)', spark: sp('story'), color: '#f5a623' }
  ]
  const completion = k.detective.sessions ? Math.round((k.detective.completed / k.detective.sessions) * 100) : 0
  const activityLabel = (a: Kpis['activity'][number]) => {
    const [kind, v] = a.label.split(':')
    const map: Record<string, [string, string, string]> = {
      'bakasa.round': ['🕵️', v === 'SPY' ? 'جولة بكاسة: البِكس كسب' : 'جولة بكاسة: اللاعبين كسبوا', v === 'SPY' ? 'Bakasa round: spy won' : 'Bakasa round: players won'],
      'detective.completed': ['🔍', `تحقيق اكتمل بـ ${v} نقطة`, `Investigation completed (${v} pts)`],
      'user.guest': ['👤', 'لاعب ضيف جديد', 'New guest player'], 'user.registered': ['🧑‍💼', 'حساب جديد', 'New account'],
      'mappings.approve': ['✅', 'اعتماد روابط أسئلة', 'Question links approved'], 'puzzle.generate': ['🧩', 'توليد قطع أحجية', 'Puzzle pieces generated'],
      'content.import.story': ['📥', 'استيراد قصة', 'Story imported'], 'room.start': ['🎮', 'بدء غرفة أحجية', 'Puzzle room started'],
      'maintenance.images.dedupe': ['🧹', 'صيانة صور القصص', 'Story images maintenance']
    }
    const m = map[kind]
    return m ? [m[0], ar ? m[1] : m[2]] : ['📌', a.label]
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-white/50">{ar ? (hour < 12 ? 'صباح الخير 👋' : 'مساء الخير 👋') : (hour < 12 ? 'Good morning 👋' : 'Good evening 👋')}</p>
          <h1 className="text-3xl font-extrabold">{ar ? 'لوحة القيادة' : 'Command center'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => <button key={d} type="button" className={`ar-chip !py-1.5`} aria-pressed={days === d} onClick={() => setDays(d)}>{d} {ar ? 'يوم' : 'days'}</button>)}
          <button type="button" className="ar-icon h-9 w-9" onClick={load} aria-label={ar ? 'تحديث' : 'Refresh'}>↻</button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((c) => (
          <div key={c.label} className="kpi" style={{ ['--glow' as string]: c.glow }}>
            <div className="relative flex items-start justify-between"><span className="text-sm text-white/60">{c.label}</span><span className="text-xl" aria-hidden="true">{c.icon}</span></div>
            <div className="relative mt-1 text-4xl font-black tracking-tight" dir="ltr" style={{ textAlign: ar ? 'right' : 'left' }}>{c.value}</div>
            <div className="relative text-xs text-white/50">{c.sub}</div>
            <Spark values={c.spark} color={c.color} />
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{ar ? `النشاط آخر ${k.days} يوم` : `Activity – last ${k.days} days`}</h2>
          <div className="flex flex-wrap gap-1.5">{SERIES.map((s) => (
            <button key={s.k} type="button" aria-pressed={!hidden.has(s.k)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s.k)) n.delete(s.k); else n.add(s.k); return n })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${hidden.has(s.k) ? 'opacity-40' : ''}`} style={{ background: `${s.color}22`, color: s.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{ar ? s.ar : s.en}</button>))}</div>
        </div>
        <div className="flex h-48 items-end gap-1" dir="ltr" role="img" aria-label={ar ? 'رسم بياني للنشاط اليومي' : 'Daily activity chart'}>
          {k.series.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
              <div className="flex flex-col-reverse overflow-hidden rounded-md">
                {SERIES.filter((s) => !hidden.has(s.k)).map((s) => d[s.k] > 0 && <div key={s.k} style={{ height: `${(d[s.k] / maxDay) * 176}px`, background: s.color }} />)}
              </div>
              <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[10px] group-hover:block" dir="ltr">
                {d.day.slice(5)} · {SERIES.map((s) => d[s.k]).join('/')}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-white/40" dir="ltr"><span>{k.series[0]?.day.slice(5)}</span><span>{k.series[k.series.length - 1]?.day.slice(5)}</span></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3" style={{ background: 'linear-gradient(160deg, #3a1d14, #15151e 60%)' }}>
          <div className="flex items-center gap-3"><SpyArt className="h-14 w-14" /><div><h3 className="font-bold">{ar ? 'بكاسة' : 'Bakasa'}</h3><p className="text-xs text-white/50">{k.bakasa.categories} {ar ? 'فئة' : 'categories'} · {k.bakasa.words} {ar ? 'كلمة' : 'words'}</p></div></div>
          <div className="flex items-center gap-3"><Donut a={k.bakasa.spy_wins} b={k.bakasa.player_wins} colors={['#ff6fa8', '#7bd96a']} label={ar ? 'نسبة فوز البِكس' : 'Spy win rate'} />
            <div className="space-y-1 text-sm"><p><span className="text-[#ff6fa8]">●</span> {ar ? 'البِكس كسب' : 'Spy won'}: <b>{k.bakasa.spy_wins}</b></p><p><span className="text-[#7bd96a]">●</span> {ar ? 'اللاعبين كسبوا' : 'Players won'}: <b>{k.bakasa.player_wins}</b></p><p className="text-white/50">{k.bakasa.players} {ar ? 'لاعب مختلف' : 'unique players'}</p></div></div>
          <div className="space-y-1.5">{k.bakasa.top_categories.slice(0, 5).map((c) => { const max = Math.max(1, ...k.bakasa.top_categories.map((x) => x.rounds)); return (
            <div key={c.name_en} className="flex items-center gap-2 text-xs"><span className="w-28 truncate">{c.emoji} {ar ? c.name_ar : c.name_en}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${(c.rounds / max) * 100}%`, background: c.color }} /></div><b className="w-6 text-end">{c.rounds}</b></div>) })}</div>
          <Link className="btn-ghost w-full text-sm" to="/admin/bakasa">{ar ? 'إدارة الكلمات' : 'Manage words'}</Link>
        </div>

        <div className="card space-y-3" style={{ background: 'linear-gradient(160deg, #0f2a2a, #15151e 60%)' }}>
          <div className="flex items-center gap-3"><DetectiveArt className="h-14 w-14" /><div><h3 className="font-bold">{ar ? 'المحقق' : 'Detective'}</h3><p className="text-xs text-white/50">{k.detective.published}/{k.detective.cases} {ar ? 'قضية منشورة' : 'cases published'}</p></div></div>
          <div className="flex items-center gap-3"><Donut a={k.detective.completed} b={Math.max(0, k.detective.sessions - k.detective.completed)} colors={['#14b8a6', '#334155']} label={ar ? 'نسبة الإكمال' : 'Completion rate'} />
            <div className="space-y-1 text-sm"><p>{ar ? 'نسبة الإكمال' : 'Completion'}: <b>{completion}%</b></p><p>{ar ? 'حلّوا القضية' : 'Solved'}: <b>{k.detective.solved}</b></p>
              <p>{ar ? 'متوسط النقاط' : 'Avg score'}: <b>{k.detective.avg_score ?? '—'}</b></p><p>{ar ? 'متوسط الوقت' : 'Avg time'}: <b>{k.detective.avg_minutes ?? '—'}</b> {ar ? 'د' : 'min'}</p></div></div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs"><div className="rounded-xl bg-white/5 p-2"><b className="block text-lg">{k.detective.discoveries}</b>{ar ? 'دليل اتكشف' : 'clues found'}</div><div className="rounded-xl bg-white/5 p-2"><b className="block text-lg">{k.detective.hints}</b>{ar ? 'تلميح اتاخد' : 'hints used'}</div></div>
          <Link className="btn-ghost w-full text-sm" to="/admin/detective">{ar ? 'استوديو المحقق' : 'Detective studio'}</Link>
        </div>

        <div className="card space-y-3" style={{ background: 'linear-gradient(160deg, #142247, #15151e 60%)' }}>
          <div className="flex items-center gap-3"><PuzzleBookArt className="h-14 w-14" /><div><h3 className="font-bold">{ar ? 'أحجية الحكاية' : 'Story Puzzle'}</h3><p className="text-xs text-white/50">{k.story.images} {ar ? 'صورة' : 'images'} · {k.story.pieces} {ar ? 'قطعة' : 'pieces'}</p></div></div>
          <div className="flex items-center gap-3"><Donut a={k.story.published} b={k.story.drafts} colors={['#3b82f6', '#334155']} label={ar ? 'نسبة النشر' : 'Published share'} />
            <div className="space-y-1 text-sm"><p>{ar ? 'منشورة' : 'Published'}: <b>{k.story.published}</b></p><p>{ar ? 'مسودات' : 'Drafts'}: <b>{k.story.drafts}</b></p><p>{ar ? 'غرف خلصت' : 'Rooms finished'}: <b>{k.story.rooms_finished}</b></p></div></div>
          <div className="grid grid-cols-2 gap-2"><Link className="btn-primary text-sm" to="/admin/rooms">{ar ? '+ غرفة جديدة' : '+ New room'}</Link><Link className="btn-ghost text-sm" to="/admin/stories">{ar ? 'القصص' : 'Stories'}</Link></div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <div className="card space-y-2"><h3 className="font-bold">🏆 {ar ? 'أبطال بكاسة' : 'Bakasa champions'}</h3>
          {k.top_bakasa.length === 0 && <p className="text-sm text-white/50">{ar ? 'لسه مفيش مباريات.' : 'No matches yet.'}</p>}
          {k.top_bakasa.map((p, i) => <div key={i} className="flex items-center gap-2 rounded-xl bg-white/5 p-2"><span className="w-5 text-center">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><Avatar avatar={p.avatar} size={30} /><span className="flex-1 truncate text-sm font-semibold">{p.name}</span><span className="text-xs text-white/50">{p.matches} {ar ? 'مباراة' : 'm'}</span><b className="text-[#ffb938]">{p.score}</b></div>)}
        </div>
        <div className="card space-y-2"><h3 className="font-bold">🕵️‍♀️ {ar ? 'أمهر المحققين' : 'Top detectives'}</h3>
          {k.top_detectives.length === 0 && <p className="text-sm text-white/50">{ar ? 'لسه محدش حل قضية.' : 'No solved cases yet.'}</p>}
          {k.top_detectives.map((p, i) => <div key={i} className="flex items-center gap-2 rounded-xl bg-white/5 p-2"><span className="w-5 text-center">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><span className="grid h-8 w-8 place-items-center rounded-full bg-[#14b8a6]/25">🔎</span><span className="flex-1 truncate text-sm font-semibold">{p.name}</span><b className="text-[#5eead4]">{p.score}</b></div>)}
        </div>
        <div className="card space-y-2"><div className="flex items-center justify-between"><h3 className="font-bold">⚡ {ar ? 'آخر الأحداث' : 'Live activity'}</h3><Link className="text-xs text-[#c4b5fd] hover:underline" to="/admin/reports">{ar ? 'التقارير' : 'Reports'}</Link></div>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">{k.activity.slice(0, 14).map((a, i) => { const [icon, text] = activityLabel(a); return (
            <li key={i} className="flex items-center gap-2 rounded-xl bg-white/[.03] px-2.5 py-2 text-sm"><span aria-hidden="true">{icon}</span><span className="flex-1 truncate">{text}</span>
              <time className="shrink-0 text-[11px] text-white/40">{new Date(a.at).toLocaleString(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</time></li>) })}</ul>
        </div>
      </section>
      <p className="text-center text-[11px] text-white/30">{ar ? 'بيتحدّث كل دقيقة · ' : 'Refreshes every minute · '}{new Date(k.generated_at).toLocaleTimeString(ar ? 'ar-EG' : 'en-GB')}</p>
    </div>
  )
}

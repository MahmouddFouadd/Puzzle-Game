import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { LangToggle } from '../../components/LangToggle'
import { advance, leaveRoom, type BakasaStatus } from '../../bakasa/api'
import { BakasaLogo, ConfirmDialog, playSound, SoundToggle, TimerRing, useBakasaRoom, useCountdown } from '../../bakasa/ui'
import { LobbyView, noticeText } from '../../bakasa/Lobby'
import { DiscussionPhase, GuessPhase, ResultsPhase, RevealPhase, VotingPhase } from '../../bakasa/Phases'

const PHASES: Record<BakasaStatus, [string, string]> = {
  LOBBY: ['اللوبي', 'Lobby'], REVEAL: ['كشف الأدوار', 'Role reveal'], DISCUSSION: ['الأسئلة والنقاش', 'Discussion'], VOTING: ['التصويت', 'Voting'],
  GUESS: ['تخمين البِكس', 'Spy guess'], RESULT: ['النتيجة', 'Result'], FINISHED: ['النتيجة النهائية', 'Final result'], CLOSED: ['الغرفة مقفولة', 'Room closed']
}

export default function BakasaRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const { state, error, online, offset, reload } = useBakasaRoom(roomId)
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([])
  const [leaving, setLeaving] = useState(false)
  const lastVersion = useRef<number>(-1)
  const lastStatus = useRef<string>('')
  const room = state?.room
  const phaseLeft = useCountdown(room?.phase_ends_at, offset)
  const turnLeft = useCountdown(room?.status === 'DISCUSSION' ? room?.turn_ends_at : null, offset)

  // Activity feed from server notices.
  useEffect(() => {
    if (!room || room.version === lastVersion.current) return
    const first = lastVersion.current === -1
    lastVersion.current = room.version
    const text = noticeText(room.notice, ar)
    if (!first && text && room.status === 'LOBBY') {
      setFeed((f) => [...f.slice(-1), { id: room.version, text }])
      if (room.notice?.startsWith('join:')) playSound('join')
    }
  }, [room, ar])
  useEffect(() => { if (feed.length === 0) return; const id = window.setTimeout(() => setFeed((f) => f.slice(1)), 4500); return () => window.clearTimeout(id) }, [feed])
  useEffect(() => { if (room && room.status !== lastStatus.current) { if (lastStatus.current && room.status === 'VOTING') playSound('vote'); lastStatus.current = room.status; setFeed([]) } }, [room])

  // Deadlines: any client nudges the server when a timer reaches zero. The server re-checks the deadline.
  useEffect(() => {
    if (!room || !roomId) return
    const due = (phaseLeft === 0 && room.phase_ends_at) || (turnLeft === 0 && room.turn_ends_at)
    if (!due) return
    const id = window.setTimeout(() => { advance(roomId).then(reload).catch(() => undefined) }, 400 + Math.random() * 600)
    return () => window.clearTimeout(id)
  }, [phaseLeft, turnLeft, room, roomId, reload])
  // During reveal, check periodically whether everyone has seen their role.
  useEffect(() => {
    if (room?.status !== 'REVEAL' || !roomId) return
    const id = window.setInterval(() => { advance(roomId).then(reload).catch(() => undefined) }, 3000)
    return () => window.clearInterval(id)
  }, [room?.status, roomId, reload])
  useEffect(() => { if (phaseLeft !== null && phaseLeft <= 5 && phaseLeft > 0) playSound('tick') }, [phaseLeft])

  const doLeave = async () => { if (roomId) { try { await leaveRoom(roomId) } catch { /* leaving anyway */ } } nav('/bakasa', { replace: true }) }

  if (!state) {
    return <main className="bakasa grid place-items-center p-6"><div className="bk-panel space-y-3 text-center">
      {error ? <><p role="alert">{ar ? 'مقدرناش نفتح الغرفة. ممكن تكون مش عضو فيها أو الاتصال ضعيف.' : 'Could not open the room. You may not be a member, or the connection is weak.'}</p>
        <div className="flex justify-center gap-2"><button className="bk-btn" type="button" onClick={() => void reload()}>{ar ? 'حاول تاني' : 'Retry'}</button><Link className="bk-btn-ghost" to="/bakasa/join">{ar ? 'ادخل بكود' : 'Join with code'}</Link></div></>
        : <p role="status">{ar ? 'بنجهّز الغرفة…' : 'Opening the room…'}</p>}
    </div></main>
  }
  const r = state.room
  const me = state.players.find((p) => p.user_id === state.me)
  if (r.status === 'CLOSED' || !me || me.status !== 'ACTIVE') {
    return <main className="bakasa grid place-items-center p-6"><div className="bk-panel space-y-3 text-center">
      <p>{r.status === 'CLOSED' ? (ar ? 'الغرفة دي اتقفلت.' : 'This room is closed.') : (ar ? 'انت خرجت من الغرفة دي.' : 'You left this room.')}</p>
      <div className="flex justify-center gap-2">
        {r.status !== 'CLOSED' && <Link className="bk-btn" to={`/bakasa/join/${r.code}`}>{ar ? 'ارجع للغرفة' : 'Rejoin'}</Link>}
        <Link className="bk-btn-ghost" to="/bakasa">{ar ? 'قائمة بكاسة' : 'Bakasa menu'}</Link>
      </div></div></main>
  }
  const phaseTotal = { REVEAL: r.settings.reveal_seconds, DISCUSSION: r.settings.discussion_seconds, VOTING: r.settings.voting_seconds, GUESS: r.settings.guess_seconds } as Record<string, number>

  return (
    <main className="bakasa">
      <div className="bk-shell space-y-4">
        <header className="bk-panel space-y-3 !p-4">
          <div className="flex items-center gap-3">
            <BakasaLogo small />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl">{r.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bk-chip bg-bk-accent/20 text-bk-accent" dir="ltr">{r.code}</span>
                <span className={`bk-chip ${online ? 'bg-bk-lime/15 text-bk-lime' : 'bg-[#ff5d5d]/20 text-[#ff9b9b]'}`} role="status">● {online ? (ar ? 'متصل' : 'Online') : (ar ? 'بنحاول نرجّعك…' : 'Reconnecting…')}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1"><SoundToggle /></div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs opacity-70">{r.round_no > 0 ? (ar ? `الجولة ${r.round_no} من ${r.settings.rounds}` : `Round ${r.round_no} of ${r.settings.rounds}`) : (ar ? 'قبل البداية' : 'Pre-game')}</div>
              <div className="font-display text-lg text-bk-accent">{PHASES[r.status][ar ? 0 : 1]}</div>
              {state.round && r.status !== 'LOBBY' && <span className="bk-chip mt-1" style={{ background: `${state.round.color}33`, color: state.round.color }}>{state.round.emoji} {ar ? state.round.category_ar : state.round.category_en}</span>}
            </div>
            <TimerRing seconds={phaseLeft} total={phaseTotal[r.status] ?? 0} label={ar ? 'الوقت المتبقي' : 'Time left'} />
          </div>
        </header>

        {!online && <p className="bk-panel text-center" role="alert">📡 {ar ? 'الاتصال انقطع… بنحاول نرجعك للعبة' : 'Connection lost… trying to get you back into the game'}</p>}

        {r.status === 'LOBBY' && <LobbyView state={state} reload={reload} />}
        {r.status === 'REVEAL' && <RevealPhase state={state} />}
        {r.status === 'DISCUSSION' && state.round && <DiscussionPhase state={state} turnLeft={turnLeft} reload={reload} />}
        {r.status === 'VOTING' && state.round && <VotingPhase state={state} reload={reload} />}
        {r.status === 'GUESS' && <GuessPhase state={state} reload={reload} />}
        {(r.status === 'RESULT' || r.status === 'FINISHED') && <ResultsPhase state={state} reload={reload} onLeave={() => setLeaving(true)} />}

        <div className="flex items-center justify-between pt-2">
          <button type="button" className="bk-btn-ghost text-sm" onClick={() => setLeaving(true)}>🚪 {ar ? 'خروج' : 'Leave'}</button>
          <LangToggle />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4" style={{ bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 5rem))' }} aria-live="polite">
        {feed.map((f) => <div key={f.id} className="bk-pop rounded-full bg-bk-700/95 px-4 py-2 text-sm shadow-xl">{f.text}</div>)}
      </div>

      <ConfirmDialog open={leaving} title={ar ? 'تخرج من الغرفة؟' : 'Leave the room?'}
        body={['REVEAL', 'DISCUSSION', 'VOTING', 'GUESS'].includes(r.status)
          ? (ar ? 'فيه جولة شغالة. لو خرجت هتتشال من الجولة، ولو عددكم قل عن 3 أو البِكس خرج الجولة هتتلغي.' : 'A round is in progress. You will be removed from it; if fewer than 3 remain or the spy leaves, the round is cancelled.')
          : (ar ? 'تقدر ترجع بنفس الكود بعدين.' : 'You can come back later with the same code.')}
        confirm={ar ? 'اخرج' : 'Leave'} onConfirm={() => void doLeave()} onClose={() => setLeaving(false)} />
    </main>
  )
}

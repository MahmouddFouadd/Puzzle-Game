import { shareUrl } from '../lib/publicUrl'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../lib/i18n'
import { LangToggle } from '../components/LangToggle'
import { errorKey } from '../stories/errors'
import { useRoomState } from '../rooms/useRoomState'
import { advanceRoom, createTeam, joinTeam, leaveTeam, selectImage, setTeamReady, startGame, setRoomStatus, playerSetRoomStory, hostError, type StoryCard } from '../rooms/api'
import { StoryPicker } from '../rooms/StoryPicker'
import { secondsLeft } from '../rooms/util'
import { GameScreen } from '../game/GameScreen'
import { crestColor } from '../components/StoryArt'

export default function Lobby() {
  const { roomId } = useParams<{ roomId: string }>()
  const { session, loading } = useAuth()
  const { t, lang } = useI18n()
  const ar = lang === 'ar'
  const [picking, setPicking] = useState(false)
  const [pick, setPick] = useState<StoryCard | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const lastTitle = useRef<string | null>(null)
  const nav = useNavigate()
  const { state, error: loadError, reload } = useRoomState(session ? roomId : undefined)
  const [error, setError] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [hintFor, setHintFor] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState(false)

  const me = session?.user.id
  const room = state?.room ?? null
  const status = room?.status

  useEffect(() => {
    if (status !== 'COUNTDOWN' || !roomId) return
    const tick = window.setInterval(() => {
      setNow(Date.now())
      if (secondsLeft(room?.countdown_ends_at ?? null, Date.now()) === 0) advanceRoom(roomId).then(reload).catch(() => undefined)
    }, 500)
    return () => window.clearInterval(tick)
  }, [status, room?.countdown_ends_at, roomId, reload])

  const storyTitle = room?.settings_snapshot.story.title ?? null
  const isHost = !!room?.player_hosted && !!me && room.created_by === me
  // Tell everyone when the host picks a different story.
  useEffect(() => {
    if (!storyTitle) return
    if (lastTitle.current && lastTitle.current !== storyTitle && !isHost) setNotice(ar ? `📖 صاحب الغرفة اختار قصة: ${storyTitle}` : `📖 The host picked a story: ${storyTitle}`)
    lastTitle.current = storyTitle
  }, [storyTitle, isHost, ar])
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(null), 4000); return () => window.clearTimeout(id) }, [notice])
  const hostRun = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await reload() } catch (e) { setError(hostError(e, ar)) } }

  const names = useMemo(() => new Map((state?.roomMembers ?? []).map((m) => [m.user_id, m.display_name])), [state])
  const myTeam = state?.teams.find((tm) => state.teamMembers.some((m) => m.team_id === tm.id && m.user_id === me)) ?? null
  const iAmCaptain = !!myTeam && myTeam.captain_user_id === me
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await reload() } catch (e) { setError(t(errorKey(e))) } }

  if (loading) return <p className="p-6" role="status">{t('loading')}</p>
  if (!session) return <Navigate to="/join" replace />
  if (loadError && !state) return <p className="p-6 text-danger" role="alert">{t('loadFailed')}</p>
  if (!state) return <p className="p-6" role="status">{t('loading')}</p>

  const mine = state.roomMembers.find((m) => m.user_id === me)
  if (!room) {
    return (
      <main className="min-h-screen grid place-items-center p-4"><div className="card max-w-sm space-y-3 text-center">
        <p role="status">{mine?.status === 'PENDING' ? t('waitingApproval') : mine?.status === 'REJECTED' ? t('rejectedMsg') : t('roomNotFound')}</p>
        <button className="btn-ghost" type="button" onClick={() => nav('/join')}>{t('joinBtn')}</button>
      </div></main>
    )
  }

  const open = room.status === 'WAITING' || room.status === 'READY'
  const myAssignment = myTeam ? state.assignments.find((a) => a.team_id === myTeam.id) : undefined
  const submitTeam = (e: FormEvent) => { e.preventDefault(); if (teamName.trim()) void run(async () => { await createTeam(room.id, teamName.trim()); setTeamName('') }) }

  return (
    <main className="min-h-screen"><div className="game-shell space-y-4">
      <header className="story-panel space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="hero-title text-3xl">{room.settings_snapshot.story.title}</h1>
          <LangToggle />
        </div>
        <button type="button" className="code-chip" dir="ltr" aria-label={t('shareCode')} onClick={() => {
          const url = shareUrl(`/join/${room.code}`)
          const shareable = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> }
          if (shareable.share) { void shareable.share({ title: room.settings_snapshot.story.title, url }).catch(() => undefined); return }
          void navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }).catch(() => undefined)
        }}>{room.code} <span aria-hidden="true">⇪</span></button>
        {copied && <span role="status" className="ms-2 text-sm text-ok">{t('codeCopied')}</span>}
        {open && <p className="status-banner" role="status"><span className="metric-dot" aria-hidden="true" />{room.status === 'READY' ? t('roomReady') : t('roomWaiting')}</p>}
      </header>
      {(error !== null || loadError !== null) && <p role="alert" className="text-danger">{error ?? t('loadFailed')}</p>}
      {notice && <p className="card pop-in border-gold-400" role="status">{notice}</p>}
      {room.player_hosted && open && (
        <section className="story-panel space-y-3" aria-label={ar ? 'إعدادات صاحب الغرفة' : 'Host controls'}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold-500/20 text-2xl" aria-hidden="true">📖</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs opacity-70">{isHost ? (ar ? 'انت صاحب الغرفة · القصة المختارة' : 'You are the host · selected story') : (ar ? 'القصة اللي اختارها صاحب الغرفة' : 'Story chosen by the host')}</div>
              <b className="block truncate text-lg">{storyTitle}</b>
            </div>
            {isHost && <button type="button" className="btn-ghost" onClick={() => { setPick(null); setPicking(true) }}>{ar ? 'غيّر القصة' : 'Change story'}</button>}
          </div>
          {isHost && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button type="button" className="btn-primary" disabled={room.status !== 'READY'} onClick={() => void hostRun(() => startGame(room.id, false))}>
                ▶ {room.status === 'READY' ? (ar ? 'ابدأ اللعبة' : 'Start the game') : (ar ? 'مستني الفرق تجهز…' : 'Waiting for teams…')}</button>
              <button type="button" className="btn-ghost" onClick={() => { if (window.confirm(ar ? 'تقفل الغرفة؟' : 'Close this room?')) void hostRun(() => setRoomStatus(room.id, 'cancel')) }}>{ar ? 'اقفل الغرفة' : 'Close room'}</button>
            </div>
          )}
        </section>
      )}
      {picking && isHost && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3" role="dialog" aria-modal="true" aria-label={ar ? 'اختار القصة' : 'Choose a story'}>
          <div className="mx-auto max-w-3xl space-y-3 rounded-2xl bg-ink-800 p-4">
            <div className="flex items-center justify-between"><h2 className="font-display text-2xl">{ar ? 'اختار القصة' : 'Choose a story'}</h2>
              <button type="button" className="btn-ghost" onClick={() => setPicking(false)}>{ar ? 'إلغاء' : 'Cancel'}</button></div>
            <p className="text-sm opacity-75">{ar ? 'تغيير القصة بيلغي اختيارات الصور للفرق، وكل فريق يختار تاني.' : 'Changing the story clears every team’s picture choice.'}</p>
            <StoryPicker ar={ar} value={pick?.id ?? room.story_id} onChange={setPick} />
            <button type="button" className="btn-primary w-full" disabled={!pick || pick.id === room.story_id}
              onClick={() => { if (pick) void hostRun(async () => { await playerSetRoomStory(room.id, pick.id); setPicking(false) }) }}>{ar ? 'تأكيد القصة' : 'Confirm story'}</button>
          </div>
        </div>
      )}

      {room.status === 'COUNTDOWN' && (
        <section className="story-panel text-center" aria-live="assertive">
          <div className="opacity-70">{t('countdownTitle')}</div>
          <div key={secondsLeft(room.countdown_ends_at, now)} className="pop-in hero-title text-8xl">{secondsLeft(room.countdown_ends_at, now) || t('startWord')}</div>
        </section>
      )}
      {myTeam && me && ['PLAYING', 'PAUSED', 'FINISHED'].includes(room.status) && <GameScreen roomId={room.id} teamId={myTeam.id} userId={me} />}
      {room.status === 'CANCELLED' && <p className="card" role="status">{t('cancelledMsg')}</p>}
      {room.status === 'FINISHED' && <p className="card" role="status">{t('finishedMsg')}</p>}

      {(open || room.status === 'COUNTDOWN') && <section className="space-y-2">
        <h2 className="font-display text-xl">{t('teamsHeading')} ({state.teams.length}/{room.max_teams})</h2>
        {state.teams.length === 0 && <p className="opacity-70">{t('noTeams')}</p>}
        {state.teams.map((tm, index) => {
          const members = state.teamMembers.filter((m) => m.team_id === tm.id)
          const full = members.length >= room.max_team_members
          const isMine = myTeam?.id === tm.id
          return (
            <div key={tm.id} className={`story-panel pop-in space-y-2 !p-4 ${isMine ? '!border-gold-400' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="team-crest" style={{ background: crestColor(index) }} aria-hidden="true">{tm.name.trim().charAt(0) || '★'}</span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-lg">{tm.name}{isMine && <span className="ms-2 text-xs text-gold-400">({t('yourTeamLabel')})</span>}</strong>
                  <span className="text-sm opacity-70">{members.length}/{room.max_team_members} {t('playersLabel')}</span>
                </div>
                {tm.is_ready && <span className="rounded-full bg-ok/25 px-3 py-1 text-xs font-semibold text-parchment-50">✓ {t('readyLabel')}</span>}
              </div>
              <ul className="flex flex-wrap gap-1.5">{members.map((m) => (
                <li key={m.user_id} className={`rounded-full px-2.5 py-1 text-sm ${tm.captain_user_id === m.user_id ? 'bg-gold-500/20 text-gold-400' : 'bg-ink-900/60'}`}>
                  {tm.captain_user_id === m.user_id && <span aria-label={t('captainLabel')}>★ </span>}{names.get(m.user_id) ?? '…'}</li>))}</ul>
              {open && !myTeam && <button className="btn-primary" type="button" disabled={full} onClick={() => void run(() => joinTeam(tm.id))}>{full ? t('fullLabel') : t('joinTeam')}</button>}
              {open && isMine && <button className="btn-ghost" type="button" onClick={() => void run(() => leaveTeam(tm.id))}>{t('leaveTeam')}</button>}
            </div>
          )
        })}
        {open && !myTeam && room.players_can_create_teams && state.teams.length < room.max_teams && (
          <form onSubmit={submitTeam} className="card space-y-2">
            <div className="text-sm opacity-70">{t('createTeamHere')}</div>
            <div className="flex gap-2">
              <input className="input" aria-label={t('teamNameLabel')} placeholder={t('teamNameLabel')} maxLength={40} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              <button className="btn-primary" type="submit">{t('createTeamBtn')}</button>
            </div>
          </form>
        )}
      </section>}

      {myTeam && (open || room.status === 'COUNTDOWN') && (
        <section className="space-y-2">
          <h2 className="font-display text-xl">{t('chooseImageTitle')}</h2>
          <p className="text-sm opacity-70">{iAmCaptain ? t('youAreCaptain') : t('onlyCaptain')} {t('tapHint')}</p>
          <ul className="grid grid-cols-2 gap-2">
            {room.settings_snapshot.images.map((img) => {
              const taken = state.assignments.find((a) => a.image_id === img.id)
              const takenBy = taken ? state.teams.find((x) => x.id === taken.team_id) : undefined
              const mineImg = taken?.team_id === myTeam.id
              return (
                <li key={img.id}>
                  <button type="button" onClick={() => setHintFor(hintFor === img.id ? null : img.id)} aria-expanded={hintFor === img.id}
                    className={`w-full aspect-square rounded-card grid place-items-center relative overflow-hidden border ${mineImg ? 'border-gold-500' : 'border-parchment-200/20'} ${taken && !mineImg ? 'opacity-50' : ''}`}
                    style={{ background: 'linear-gradient(135deg,#3b3550,#1f7a8c)' }}>
                    <span className="absolute inset-0 backdrop-blur-xl" aria-hidden="true" />
                    <span className="relative font-display text-4xl">{img.position}</span>
                    <span className="relative text-xs">{mineImg ? t('yours') : takenBy ? `${t('takenBy')} ${takenBy.name}` : t('hiddenImage')}</span>
                  </button>
                  {hintFor === img.id && <p className="text-sm mt-1 card">{img.hint ?? t('noHint')}</p>}
                  {iAmCaptain && open && !taken && <button className="btn-primary w-full mt-1" type="button" onClick={() => void run(() => selectImage(myTeam.id, img.id))}>{t('selectBtn')}</button>}
                </li>
              )
            })}
          </ul>
          {iAmCaptain && open && (
            <button className={myTeam.is_ready ? 'btn-ghost w-full' : 'btn-primary w-full'} type="button" disabled={!myAssignment && !myTeam.is_ready}
              onClick={() => void run(() => setTeamReady(myTeam.id, !myTeam.is_ready))}>{myTeam.is_ready ? t('unreadyBtn') : t('readyBtn')}</button>
          )}
          {open && myTeam.is_ready && <p role="status" className="text-center opacity-80">{t('waitingStart')}</p>}
        </section>
      )}
    </div></main>
  )
}

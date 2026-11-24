import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../lib/i18n'
import { LangToggle } from '../components/LangToggle'
import { errorKey } from '../stories/errors'
import { useRoomState } from '../rooms/useRoomState'
import { advanceRoom, createTeam, joinTeam, leaveTeam, selectImage, setTeamReady } from '../rooms/api'
import { secondsLeft } from '../rooms/util'
import { GameScreen } from '../game/GameScreen'

export default function Lobby() {
  const { roomId } = useParams<{ roomId: string }>()
  const { session, loading } = useAuth()
  const { t } = useI18n()
  const nav = useNavigate()
  const { state, error: loadError, reload } = useRoomState(session ? roomId : undefined)
  const [error, setError] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [hintFor, setHintFor] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

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
    <main className="min-h-screen p-4 max-w-xl mx-auto space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div><h1 className="font-display text-2xl text-gold-400">{room.settings_snapshot.story.title}</h1><div className="text-sm opacity-70" dir="ltr">{room.code}</div></div>
        <LangToggle />
      </header>
      {(error !== null || loadError !== null) && <p role="alert" className="text-danger">{error ?? t('loadFailed')}</p>}

      {room.status === 'COUNTDOWN' && (
        <section className="card text-center" aria-live="assertive">
          <div className="opacity-70">{t('countdownTitle')}</div>
          <div className="font-display text-7xl text-gold-400">{secondsLeft(room.countdown_ends_at, now) || t('startWord')}</div>
        </section>
      )}
      {myTeam && me && ['PLAYING', 'PAUSED', 'FINISHED'].includes(room.status) && <GameScreen roomId={room.id} teamId={myTeam.id} userId={me} />}
      {room.status === 'CANCELLED' && <p className="card" role="status">{t('cancelledMsg')}</p>}
      {room.status === 'FINISHED' && <p className="card" role="status">{t('finishedMsg')}</p>}

      {(open || room.status === 'COUNTDOWN') && <section className="space-y-2">
        <h2 className="font-display text-xl">{t('teamsHeading')} ({state.teams.length}/{room.max_teams})</h2>
        {state.teams.length === 0 && <p className="opacity-70">{t('noTeams')}</p>}
        {state.teams.map((tm) => {
          const members = state.teamMembers.filter((m) => m.team_id === tm.id)
          const full = members.length >= room.max_team_members
          const isMine = myTeam?.id === tm.id
          return (
            <div key={tm.id} className={`card space-y-1 ${isMine ? 'border-gold-500' : ''}`}>
              <div className="flex justify-between gap-2">
                <strong>{tm.name}</strong>
                <span className="text-sm opacity-70">{members.length}/{room.max_team_members} {tm.is_ready ? '· ' + t('readyLabel') : ''}</span>
              </div>
              <div className="text-sm opacity-80">{members.map((m) => `${tm.captain_user_id === m.user_id ? '★ ' : ''}${names.get(m.user_id) ?? '…'}`).join('، ')}</div>
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
    </main>
  )
}

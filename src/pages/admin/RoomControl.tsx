import { shareOrigin } from '../../lib/publicUrl'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { useI18n } from '../../lib/i18n'
import { errorKey } from '../../stories/errors'
import { useRoomState } from '../../rooms/useRoomState'
import { adjustScore, getLeaderboard, setTeamState } from '../../game/api'
import type { LeaderRow } from '../../game/types'
import { advanceRoom, createTeam, removePlayer, resolveMember, setRoomStatus, setTeamCaptain, startGame } from '../../rooms/api'
import { joinUrl, secondsLeft } from '../../rooms/util'

export default function RoomControl() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const { state, error: loadError, reload } = useRoomState(id)
  const [error, setError] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [now, setNow] = useState(Date.now())
  const [board, setBoard] = useState<LeaderRow[]>([])

  const room = state?.room ?? null
  const link = room ? joinUrl(shareOrigin(), room.code) : ''
  useEffect(() => { if (link) QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null)) }, [link])

  useEffect(() => {
    if (room?.status !== 'COUNTDOWN' || !id) return
    const tick = window.setInterval(() => {
      setNow(Date.now())
      if (secondsLeft(room.countdown_ends_at, Date.now()) === 0) advanceRoom(id).then(reload).catch(() => undefined)
    }, 500)
    return () => window.clearInterval(tick)
  }, [room?.status, room?.countdown_ends_at, id, reload])

  const live = room?.status && ['PLAYING', 'PAUSED', 'FINISHED'].includes(room.status)
  useEffect(() => {
    if (!id || !live) return
    const load = () => { getLeaderboard(id).then(setBoard).catch(() => undefined) }
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [id, live, state])

  const names = useMemo(() => new Map((state?.roomMembers ?? []).map((m) => [m.user_id, m.display_name])), [state])
  const imagePos = useMemo(() => new Map((room?.settings_snapshot.images ?? []).map((i) => [i.id, i.position])), [room])

  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await reload() } catch (e) { setError(t(errorKey(e))) } }

  if (!id) return null
  if (loadError && !state) return <p role="alert" className="text-danger">{t('loadFailed')}</p>
  if (!room) return <p role="status">{t('loading')}</p>

  const open = room.status === 'WAITING' || room.status === 'READY'
  const pending = state!.roomMembers.filter((m) => m.status === 'PENDING')
  const start = () => {
    if (room.status !== 'READY' && !window.confirm(t('confirmStartOverride'))) return
    void run(() => startGame(room.id, room.status !== 'READY'))
  }
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch { setCopied(false) } }
  const addTeam = (e: FormEvent) => { e.preventDefault(); if (!teamName.trim()) return; void run(async () => { await createTeam(room.id, teamName.trim()); setTeamName('') }) }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/admin/rooms" className="underline text-gold-400">{t('rooms')}</Link>
      <h2 className="font-display text-3xl">{room.settings_snapshot.story.title}</h2>
      {(error !== null || loadError !== null) && <p role="alert" className="text-danger">{error ?? t('loadFailed')}</p>}

      <section className="card grid gap-4 sm:grid-cols-[auto_1fr]">
        {qr ? <img src={qr} alt={`QR ${room.code}`} className="w-40 h-40 bg-white rounded-xl p-1" /> : <div className="w-40 h-40 rounded-xl bg-ink-700" />}
        <div className="space-y-2">
          <div className="text-sm opacity-70">{t('roomCode')}</div>
          <div className="font-display text-4xl tracking-wider text-gold-400" dir="ltr">{room.code}</div>
          <div className="text-sm break-all" dir="ltr">{link}</div>
          <button className="btn-ghost" type="button" onClick={() => void copy()}>{copied ? t('copied') : t('copy')}</button>
          <div className="text-sm opacity-70">{t('roomStatus')}: <strong>{room.status}</strong>{room.has_pin ? ' · PIN' : ''}</div>
          {room.has_pin && <div className="text-xs opacity-60">{t('pinNote')}</div>}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 items-center">
        {open && <button className="btn-primary" type="button" disabled={state!.teams.length < 2} onClick={start}>{t('startGame')}</button>}
        {room.status === 'COUNTDOWN' && <span className="font-display text-3xl" role="status">{secondsLeft(room.countdown_ends_at, now) || t('startWord')}</span>}
        {room.status === 'PLAYING' && <button className="btn-ghost" type="button" onClick={() => void run(() => setRoomStatus(room.id, 'pause'))}>{t('pauseGame')}</button>}
        {room.status === 'PAUSED' && <button className="btn-ghost" type="button" onClick={() => void run(() => setRoomStatus(room.id, 'resume'))}>{t('resumeGame')}</button>}
        {(room.status === 'PLAYING' || room.status === 'PAUSED') && (
          <button className="btn-ghost" type="button" onClick={() => { if (window.confirm(t('confirmEnd'))) void run(() => setRoomStatus(room.id, 'end')) }}>{t('endGame')}</button>
        )}
        {!['FINISHED', 'CANCELLED'].includes(room.status) && (
          <button className="btn-ghost text-danger" type="button" onClick={() => { if (window.confirm(t('confirmCancelRoom'))) void run(() => setRoomStatus(room.id, 'cancel')) }}>{t('cancelRoom')}</button>
        )}
      </div>

      {pending.length > 0 && (
        <section className="card space-y-2">
          <h3 className="font-semibold">{t('pendingPlayers')}</h3>
          <ul className="space-y-1">{pending.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 justify-between">
              <span>{m.display_name}</span>
              <span className="flex gap-1">
                <button className="btn-primary" type="button" onClick={() => void run(() => resolveMember(room.id, m.user_id, true))}>{t('approve')}</button>
                <button className="btn-ghost" type="button" onClick={() => void run(() => resolveMember(room.id, m.user_id, false))}>{t('reject')}</button>
              </span>
            </li>))}
          </ul>
        </section>
      )}

      {live && board.length > 0 && (
        <section className="card space-y-1" aria-label={t('scoresHeading')}>
          <h3 className="font-semibold">{t('scoresHeading')}</h3>
          <ol>{board.map((r) => <li key={r.team} className="flex justify-between gap-2"><span>{r.rank ? `${r.rank}. ` : ''}{r.name} <span className="opacity-60 text-sm">({r.state})</span></span><span>{r.revealed}/{r.total} · {r.score}</span></li>)}</ol>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-display text-2xl">{t('teamsHeading')} ({state!.teams.length}/{room.max_teams})</h3>
        {state!.teams.length === 0 && <p className="opacity-70">{t('noTeams')}</p>}
        {state!.teams.map((team) => {
          const members = state!.teamMembers.filter((m) => m.team_id === team.id)
          const asg = state!.assignments.find((a) => a.team_id === team.id)
          return (
            <div key={team.id} className="card space-y-2">
              <div className="flex justify-between gap-2 flex-wrap">
                <strong>{team.name} <span className="opacity-60 text-sm">({members.length}/{room.max_team_members})</span></strong>
                <span className="text-sm">{asg ? `${t('imageNo')} ${imagePos.get(asg.image_id) ?? '?'}` : t('noImage')} · {team.is_ready ? t('readyLabel') : t('notReady')}</span>
              </div>
              {live && (
                <div className="flex flex-wrap gap-1">
                  <button className="btn-ghost" type="button" onClick={() => { const r = window.prompt(t('promptReason')); if (r?.trim()) void run(() => setTeamState(team.id, 'ABANDONED', r.trim())) }}>{t('markAbandoned')}</button>
                  <button className="btn-ghost text-danger" type="button" onClick={() => { const r = window.prompt(t('promptReason')); if (r?.trim()) void run(() => setTeamState(team.id, 'DISQUALIFIED', r.trim())) }}>{t('disqualify')}</button>
                  <button className="btn-ghost" type="button" onClick={() => {
                    const d = Number(window.prompt(t('promptDelta'))); if (!Number.isInteger(d) || d === 0) return
                    const r = window.prompt(t('promptReason')); if (r?.trim()) void run(() => adjustScore(team.id, d, r.trim()))
                  }}>{t('adjustScore')}</button>
                </div>
              )}
              <ul className="space-y-1">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{team.captain_user_id === m.user_id ? '★ ' : ''}{names.get(m.user_id) ?? '…'}</span>
                    <span className="flex gap-1">
                      {team.captain_user_id !== m.user_id && <button className="btn-ghost" type="button" onClick={() => void run(() => setTeamCaptain(team.id, m.user_id))}>{t('makeCaptain')}</button>}
                      <button className="btn-ghost text-danger" type="button" onClick={() => { if (window.confirm(t('confirmRemove'))) void run(() => removePlayer(room.id, m.user_id)) }}>{t('removePlayer')}</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {open && state!.teams.length < room.max_teams && (
          <form onSubmit={addTeam} className="flex gap-2">
            <input className="input" aria-label={t('teamNameLabel')} placeholder={t('teamNameLabel')} maxLength={40} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            <button className="btn-ghost" type="submit">{t('addTeam')}</button>
          </form>
        )}
      </section>
    </div>
  )
}

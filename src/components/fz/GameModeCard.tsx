import { Link } from 'react-router-dom'
import type { ComponentType, ReactNode } from 'react'
import { IconPlay } from '../../brand/icons'

export type GameModeCardProps = {
  to: string; accent: string; title: string; description: string; playLabel: string
  Icon: ComponentType<{ size?: number }>; art?: ReactNode; meta?: string
}
/** One card per real game mode; the whole card is a link to the mode's existing route. */
export function GameModeCard({ to, accent, title, description, playLabel, Icon, art, meta }: GameModeCardProps) {
  return (
    <Link to={to} className="fz-mode" style={{ ['--accent' as string]: accent }} aria-label={`${title} – ${playLabel}`}>
      {art && <span className="fz-mode-art" aria-hidden="true">{art}</span>}
      <span className="fz-mode-badge" aria-hidden="true"><Icon size={26} /></span>
      <span className="fz-display mt-4 block text-2xl leading-tight">{title}</span>
      {meta && <span className="mt-1 block text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>{meta}</span>}
      <span className="fz-muted mt-2 block max-w-[17rem] text-sm leading-relaxed">{description}</span>
      <span className="fz-mode-play mt-5"><IconPlay size={16} />{playLabel}</span>
    </Link>
  )
}

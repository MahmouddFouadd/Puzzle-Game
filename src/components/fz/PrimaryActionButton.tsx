import { Link } from 'react-router-dom'
import type { ComponentType, ReactNode } from 'react'

type Common = { variant?: 'primary' | 'secondary' | 'outline'; Icon?: ComponentType<{ size?: number }>; children: ReactNode; className?: string }
/** Brand button. Renders a router Link when `to` is set, otherwise a button. */
export function PrimaryActionButton(p: Common & ({ to: string } | { to?: undefined; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean })) {
  const cls = `fz-btn fz-btn-${p.variant ?? 'primary'} ${p.className ?? ''}`
  const body = <>{p.Icon && <p.Icon size={20} />}{p.children}</>
  if (p.to !== undefined) return p.to.startsWith('#') ? <a href={p.to} className={cls}>{body}</a> : <Link to={p.to} className={cls}>{body}</Link>
  return <button type={p.type ?? 'button'} className={cls} onClick={p.onClick} disabled={p.disabled}>{body}</button>
}

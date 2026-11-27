import type { ComponentType, ReactNode } from 'react'

export function EmptyState({ Icon, title, text, action }: { Icon: ComponentType<{ size?: number }>; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--fz-radius-lg)] border border-dashed border-white/15 px-6 py-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-fz-s2 text-fz-cyan" aria-hidden="true"><Icon size={28} /></span>
      <p className="fz-display text-lg">{title}</p>
      {text && <p className="fz-muted max-w-xs text-sm">{text}</p>}
      {action}
    </div>
  )
}

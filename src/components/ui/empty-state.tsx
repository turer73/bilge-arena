import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {icon ? (
        <div className="mb-5 text-[var(--text-muted)]">{icon}</div>
      ) : (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--card-bg)] border border-[var(--border)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 15c1.4 0 2.7-.7 3.5-1.8L12 12l.5-1.2c.8-1.1 2.1-1.8 3.5-1.8" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
          </svg>
        </div>
      )}
      <h3 className="font-display text-h4 font-bold text-[var(--text)] mb-1.5">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-[var(--text-sub)] leading-relaxed mb-6">{description}</p>
      )}
      {actionLabel && (actionHref || onAction) && (
        <Button
          size="md"
          onClick={onAction || (actionHref ? () => { window.location.assign(actionHref) } : undefined)}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
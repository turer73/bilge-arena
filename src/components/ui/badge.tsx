import { cn } from '@/lib/utils/cn'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string // CSS variable key: focus, reward, growth, wisdom, urgency
}

export function Badge({ color = 'focus', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
        className
      )}
      style={{
        background: `var(--${color}-bg)`,
        border: `1px solid var(--${color}-border)`,
        color: `var(--${color}-light)`,
      }}
      {...props}
    >
      {children}
    </span>
  )
}

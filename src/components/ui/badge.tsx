import { cn } from '@/lib/utils/cn'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string // CSS variable key: focus, reward, growth, wisdom, urgency
  size?: 'sm' | 'md'
  icon?: React.ReactNode
}

const sizeStyles: Record<string, string> = {
  sm: 'px-2.5 py-0.5 text-[10px] gap-1',
  md: 'px-3 py-1 text-xs gap-1.5',
}

export function Badge({ color = 'focus', size = 'md', icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold',
        sizeStyles[size],
        className
      )}
      style={{
        background: `var(--${color}-bg)`,
        border: `1px solid var(--${color}-border)`,
        color: `var(--${color}-light)`,
      }}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}
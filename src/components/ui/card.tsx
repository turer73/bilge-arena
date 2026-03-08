import { cn } from '@/lib/utils/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export function Card({ hover = true, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6',
        hover && 'card-hover',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

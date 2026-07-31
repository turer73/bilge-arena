import { cn } from '@/lib/utils/cn'

type SkeletonVariant = 'pulse' | 'shimmer'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant
  /** minHeight ile CLS önleme (üretilecek içerik tahmini yüksekliği) */
  minHeight?: string | number
}

const variantStyles: Record<SkeletonVariant, string> = {
  pulse: 'animate-pulse',
  shimmer: 'skeleton-shimmer',
}

export function Skeleton({ className, variant = 'shimmer', minHeight, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-[var(--border-strong)]',
        variantStyles[variant],
        className
      )}
      style={{ minHeight, ...style }}
      {...props}
    />
  )
}
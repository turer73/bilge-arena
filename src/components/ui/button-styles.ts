import { cn } from '@/lib/utils/cn'

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'gold'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'btn-primary active:scale-[0.97]',
  ghost: 'btn-ghost active:scale-[0.97]',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all duration-200 active:scale-[0.97] bg-[var(--urgency)] hover:bg-[var(--urgency-light)] shadow-[0_4px_14px_var(--urgency-bg)]',
  gold:
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all duration-200 active:scale-[0.97] bg-gold-badge hover:brightness-110 shadow-[0_4px_14px_var(--reward-bg)]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
}

export function buttonStyles(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(variantStyles[variant], sizeStyles[size], className)
}

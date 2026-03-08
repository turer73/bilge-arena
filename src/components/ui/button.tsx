'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils/cn'

type Variant = 'primary' | 'ghost' | 'danger' | 'gold'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
}

const variantStyles: Record<Variant, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all duration-200 bg-[var(--urgency)] hover:bg-[var(--urgency-light)] shadow-[0_4px_14px_var(--urgency-bg)]',
  gold:
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all duration-200 bg-gold-badge hover:brightness-110 shadow-[0_4px_14px_var(--reward-bg)]',
}

const sizeStyles = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(variantStyles[variant], sizeStyles[size], className)}
      {...props}
    >
      {children}
    </button>
  )
)

Button.displayName = 'Button'
export { Button }

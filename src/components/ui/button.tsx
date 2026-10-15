'use client'

import { buttonStyles, type ButtonSize, type ButtonVariant } from './button-styles'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  ref?: React.Ref<HTMLButtonElement>
}

function Button({ variant = 'primary', size = 'md', className, children, ref, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      className={buttonStyles(variant, size, className)}
      {...props}
    >
      {children}
    </button>
  )
}

export { Button }

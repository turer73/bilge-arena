'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { trackEvent } from '@/lib/utils/plausible'

type TrackedCtaVariant = 'primary' | 'ghost'

interface TrackedCtaLinkProps {
  href: string
  page: 'nasil-calisir' | 'hakkinda'
  placement: string
  variant?: TrackedCtaVariant
  className?: string
  children: ReactNode
}

const variantStyles: Record<TrackedCtaVariant, string> = {
  primary: 'btn-primary active:scale-[0.97]',
  ghost: 'btn-ghost active:scale-[0.97]',
}

export function TrackedCtaLink({
  href,
  page,
  placement,
  variant = 'primary',
  className,
  children,
}: TrackedCtaLinkProps) {
  const trackClick = () => {
    const props = { page, placement, target: href }

    trackEvent('MarketingCtaClicked', { props })

    if (typeof window.gtag === 'function') {
      window.gtag('event', 'marketing_cta_click', props)
    }
  }

  return (
    <Link
      href={href}
      onClick={trackClick}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-8 py-4 text-lg font-semibold transition-all duration-200',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}

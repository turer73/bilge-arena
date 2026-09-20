'use client'

import type { ReactNode } from 'react'
import { useWideStudy } from '@/lib/hooks/use-wide-study'
import { ACTIVATION_EXPERIMENT_ENABLED } from '@/lib/experiments/activation'
import { AcademyHome, type AcademyHomeProps } from './academy-home'

/** One mounted tree: keep mobile, SSR and an enabled activation experiment intact. */
export function HomeSurface({ children, ...props }: AcademyHomeProps & { children: ReactNode }) {
  const wide = useWideStudy()
  if (!wide || ACTIVATION_EXPERIMENT_ENABLED) return children
  return <AcademyHome {...props} />
}

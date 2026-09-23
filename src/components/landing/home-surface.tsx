'use client'

import type { ReactNode } from 'react'
import { useWideStudy } from '@/lib/hooks/use-wide-study'
import { AcademyHome, type AcademyHomeProps } from './academy-home'

/** One mounted tree: keep the established mobile and SSR surface intact. */
export function HomeSurface({ children, ...props }: AcademyHomeProps & { children: ReactNode }) {
  const wide = useWideStudy()
  if (!wide) return children
  return <AcademyHome {...props} />
}

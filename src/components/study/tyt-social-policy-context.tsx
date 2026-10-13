'use client'

import { createContext } from 'react'
import type { TytSocialExamPolicyState } from '@/lib/hooks/use-tyt-social-exam-policy'

// The desktop home owns the one policy request/form. Its tool slot must observe
// that same state, including an unsettled save, rather than fetch a second copy.
export const StudyTytSocialPolicyContext = createContext<{
  game: string
  examRef: string | null
  userId: string | null
  policy: TytSocialExamPolicyState
} | null>(null)

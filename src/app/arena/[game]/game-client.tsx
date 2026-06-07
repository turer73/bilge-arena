'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { type GameSlug, GAME_SLUGS } from '@/lib/constants/games'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { defaultExamRefForType } from '@/lib/constants/exam-types'

// Quiz engine lazy-load — agir bileseni ayri chunk'a taşı (~40KB+ JS azalma)
const QuizEngine = dynamic(
  () => import('@/components/game/quiz-engine').then(m => ({ default: m.QuizEngine })),
  {
    loading: () => (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="h-80 animate-pulse rounded-2xl bg-[var(--border)]" />
      </div>
    ),
  },
)

export default function GameClient() {
  const params = useParams()
  const router = useRouter()
  const { profile } = useAuthStore()
  const setExamRef = useGameStore((s) => s.setExamRef)
  const gameSlug = params.game as string
  const isValidSlug = GAME_SLUGS.includes(gameSlug as GameSlug)

  // Gecersiz slug — render disinda side-effect yapmamak icin useEffect kullan
  useEffect(() => {
    if (!isValidSlug) {
      router.replace('/arena')
    }
  }, [isValidSlug, router])

  // Sinav turune gore soru exam_ref default'u (yks->TYT, lgs->LGS). exam_type
  // belirlenmemisse dokunma -> oturum-ici secici / 'all' korunur.
  useEffect(() => {
    if (isValidSlug && profile?.exam_type) {
      setExamRef(defaultExamRefForType(profile.exam_type))
    }
  }, [isValidSlug, profile?.exam_type, setExamRef])

  if (!isValidSlug) return null

  return <QuizEngine game={gameSlug as GameSlug} />
}

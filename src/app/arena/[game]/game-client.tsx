'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { GAMES, type GameSlug, GAME_SLUGS } from '@/lib/constants/games'

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
  const gameSlug = params.game as string
  const isValidSlug = GAME_SLUGS.includes(gameSlug as GameSlug)

  // Gecersiz slug — render disinda side-effect yapmamak icin useEffect kullan
  useEffect(() => {
    if (!isValidSlug) {
      router.replace('/arena')
    }
  }, [isValidSlug, router])

  if (!isValidSlug) return null

  return <QuizEngine game={gameSlug as GameSlug} />
}

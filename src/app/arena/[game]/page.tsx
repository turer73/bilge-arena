'use client'

import { useParams, useRouter } from 'next/navigation'
import { GAMES, type GameSlug, GAME_SLUGS } from '@/lib/constants/games'
import { QuizEngine } from '@/components/game/quiz-engine'

export default function GameConsolePage() {
  const params = useParams()
  const router = useRouter()
  const gameSlug = params.game as string

  // Gecerli oyun slugi mi kontrol et
  if (!GAME_SLUGS.includes(gameSlug as GameSlug)) {
    router.replace('/arena')
    return null
  }

  return <QuizEngine game={gameSlug as GameSlug} />
}

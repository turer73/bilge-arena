'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { GAMES, type GameSlug, GAME_SLUGS } from '@/lib/constants/games'
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
  const searchParams = useSearchParams()
  const { profile } = useAuthStore()
  const setExamRef = useGameStore((s) => s.setExamRef)
  const selectedExamRef = useGameStore((s) => s.selectedExamRef)
  const setCategory = useGameStore((s) => s.setCategory)
  const categoryFromQueryRef = useRef(false)
  const gameSlug = params.game as string
  const isValidSlug = GAME_SLUGS.includes(gameSlug as GameSlug)

  // Gecersiz slug — render disinda side-effect yapmamak icin useEffect kullan
  useEffect(() => {
    if (!isValidSlug) {
      router.replace('/arena')
    }
  }, [isValidSlug, router])

  // Wordquest'in soru bankasi exam_ref=NULL kullanir; onceki dersten kalan
  // TYT/LGS filtresi İngilizce sorularini bosaltmamali. Mastery display scope'u
  // ayri olarak YDT'ye normalize edilir (useMasteryMap).
  // Diger derslerde profil sinav turune gore soru exam_ref default'u kullanilir.
  useEffect(() => {
    if (!isValidSlug) return
    if (gameSlug === 'wordquest') {
      if (selectedExamRef !== null) setExamRef(null)
      return
    }
    const validExamRefs = isValidSlug ? GAMES[gameSlug as GameSlug].examTags : []
    if (profile?.exam_type && (!selectedExamRef || !validExamRefs.includes(selectedExamRef))) {
      const profileDefault = defaultExamRefForType(profile.exam_type)
      setExamRef(profileDefault && validExamRefs.includes(profileDefault) ? profileDefault : validExamRefs[0] ?? null)
    }
  }, [gameSlug, isValidSlug, profile?.exam_type, selectedExamRef, setExamRef])

  // Mobil ogrenme yolu adimlari ?category=<slug> ile gelir: lobi o konuyla
  // acilsin. Query ayni oyun rotasinda degisse bile secim guncellenir. Query
  // kaldirilirsa yalnizca query'nin kurdugu kategori temizlenir; calisma/hakimiyet
  // ekranlarinin store uzerinden aktardigi kategori korunur.
  useEffect(() => {
    if (!isValidSlug) return
    const requested = searchParams.get('category')
    if (!requested || !GAMES[gameSlug as GameSlug].categories.includes(requested)) {
      if (categoryFromQueryRef.current) {
        categoryFromQueryRef.current = false
        setCategory(null)
      }
      return
    }
    categoryFromQueryRef.current = true
    setCategory(requested)
  }, [gameSlug, isValidSlug, searchParams, setCategory])

  if (!isValidSlug) return null

  return <QuizEngine game={gameSlug as GameSlug} />
}

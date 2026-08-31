'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { GAMES, getCategoriesForExam, type GameSlug, GAME_SLUGS } from '@/lib/constants/games'
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
  const setMode = useGameStore((s) => s.setMode)
  const selectedMode = useGameStore((s) => s.selectedMode)
  const setCategory = useGameStore((s) => s.setCategory)
  const categoryFromQueryRef = useRef(false)
  const gameSlug = params.game as string
  const isValidSlug = GAME_SLUGS.includes(gameSlug as GameSlug)
  const requestedExamRef = searchParams.get('exam_ref')?.trim().toUpperCase() ?? ''
  const queryExamRef = isValidSlug && GAMES[gameSlug as GameSlug].examTags.includes(requestedExamRef)
    ? requestedExamRef
    : null
  const queryMode = searchParams.get('mode')?.trim().toLowerCase() === 'practice'
    ? 'practice'
    : null

  // Gecersiz slug — render disinda side-effect yapmamak icin useEffect kullan
  useEffect(() => {
    if (!isValidSlug) {
      router.replace('/arena')
    }
  }, [isValidSlug, router])

  // Wordquest'in soru bankasi exam_ref=NULL kullanir; bunu soru tuketim
  // sinirlarinda uygulariz. Paylasilan TYT/LGS/AYT tercihini burada silmek,
  // kullanici onceki derse dondugunde sinav baglamini kaybettirir.
  // Diger derslerde profil sinav turune gore soru exam_ref default'u kullanilir.
  useEffect(() => {
    if (!isValidSlug) return
    if (queryExamRef) {
      if (selectedExamRef !== queryExamRef) setExamRef(queryExamRef)
      return
    }
    if (gameSlug === 'wordquest') return
    const validExamRefs = GAMES[gameSlug as GameSlug].examTags
    if (gameSlug === 'sosyal' && !selectedExamRef) {
      setExamRef('TYT')
      return
    }
    if (profile?.exam_type && (!selectedExamRef || !validExamRefs.includes(selectedExamRef))) {
      const profileDefault = defaultExamRefForType(profile.exam_type)
      setExamRef(profileDefault && validExamRefs.includes(profileDefault) ? profileDefault : validExamRefs[0] ?? null)
    }
  }, [gameSlug, isValidSlug, profile?.exam_type, queryExamRef, selectedExamRef, setExamRef])

  // Kurum programi yalnız server-verified practice oturumuyla kapanabilir.
  // URL'den genel bir mode secici acmiyoruz: allowlist yalniz bu dar, zamansiz
  // practice kontratidir; bilinmeyen degerler mevcut kullanici secimini korur.
  useEffect(() => {
    if (!isValidSlug || !queryMode || selectedMode === queryMode) return
    setMode(queryMode)
  }, [isValidSlug, queryMode, selectedMode, setMode])

  // Mobil ogrenme yolu adimlari ?category=<slug> ile gelir: lobi o konuyla
  // acilsin. Query ayni oyun rotasinda degisse bile secim guncellenir. Query
  // kaldirilirsa yalnizca query'nin kurdugu kategori temizlenir; calisma/hakimiyet
  // ekranlarinin store uzerinden aktardigi kategori korunur.
  useEffect(() => {
    if (!isValidSlug) return
    const requested = searchParams.get('category')
    const effectiveExamRef = queryExamRef ?? selectedExamRef
    if (!requested || !getCategoriesForExam(gameSlug as GameSlug, effectiveExamRef).includes(requested)) {
      if (categoryFromQueryRef.current) {
        categoryFromQueryRef.current = false
        setCategory(null)
      }
      return
    }
    categoryFromQueryRef.current = true
    setCategory(requested)
  }, [gameSlug, isValidSlug, queryExamRef, searchParams, selectedExamRef, setCategory])

  if (!isValidSlug) return null

  const engineExamRef = gameSlug === 'wordquest' ? null : queryExamRef ?? selectedExamRef
  return (
    <QuizEngine
      key={`${gameSlug}:${engineExamRef ?? ''}`}
      game={gameSlug as GameSlug}
    />
  )
}

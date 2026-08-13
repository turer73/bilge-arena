'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { defaultExamRefForType, gamesForExamType } from '@/lib/constants/exam-types'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { BilgeChan } from '@/components/ui/bilge-chan'
import { TodayPlanFocus } from '@/components/study/today-plan-focus'
import { MasteryActionCard } from '@/components/study/mastery-action-card'
import { StudyContextSelector } from '@/components/study/study-context-selector'

// Ağır AI-chat paketini kullanıcı açana veya masaüstü yerleşimi hazır olana kadar yükleme.
const StudyAssistant = dynamic(
  () => import('@/components/study/study-assistant').then((module) => ({ default: module.StudyAssistant })),
  { ssr: false },
)

function examRefsForGame(game: GameSlug, examType: string | null | undefined): string[] {
  const refs = [...GAMES[game].examTags]
  if (examType === 'lgs') return refs.filter((ref) => ref === 'LGS')
  if (examType === 'yks') return refs.filter((ref) => ref !== 'LGS')
  return refs
}

export default function CalismaClient() {
  const { user, profile, loading } = useAuthStore()
  const gameStore = useGameStore()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantMounted, setAssistantMounted] = useState(false)

  const availableGames = useMemo(
    () => gamesForExamType(profile?.exam_type),
    [profile?.exam_type],
  )
  const fallbackGame = availableGames.find((item) => item.slug === 'matematik') ?? availableGames[0]
  const game = availableGames.some((item) => item.slug === gameStore.selectedGame)
    ? (gameStore.selectedGame as GameSlug)
    : fallbackGame.slug
  const examRefs = useMemo(
    () => examRefsForGame(game, profile?.exam_type),
    [game, profile?.exam_type],
  )
  const profileDefaultExamRef = defaultExamRefForType(profile?.exam_type)
  const examRef = gameStore.selectedExamRef && examRefs.includes(gameStore.selectedExamRef)
    ? gameStore.selectedExamRef
    : profileDefaultExamRef && examRefs.includes(profileDefaultExamRef)
      ? profileDefaultExamRef
      : examRefs[0] ?? null

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(min-width: 768px)')
    const mountForDesktop = () => {
      if (media.matches) setAssistantMounted(true)
    }
    mountForDesktop()
    media.addEventListener?.('change', mountForDesktop)
    return () => media.removeEventListener?.('change', mountForDesktop)
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-[var(--text-sub)]" role="status">
        Yükleniyor...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl" aria-hidden="true">🔒</div>
        <h1 className="mb-2 text-xl font-bold">Giriş Yapman Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">
          Ders çalışma ortamındaki kişisel planını görmek için giriş yap.
        </p>
        <Link
          href="/giris"
          className="btn-primary inline-flex min-h-12 items-center rounded-[10px] px-8 font-display text-sm font-bold tracking-wider"
        >
          Giriş Yap
        </Link>
      </div>
    )
  }

  const handleGameChange = (nextGame: GameSlug) => {
    const nextExamRefs = examRefsForGame(nextGame, profile?.exam_type)
    const nextDefault = defaultExamRefForType(profile?.exam_type)
    const nextExamRef = examRef && nextExamRefs.includes(examRef)
      ? examRef
      : nextDefault && nextExamRefs.includes(nextDefault)
        ? nextDefault
        : nextExamRefs[0] ?? null

    gameStore.setGame(nextGame)
    gameStore.setCategory(null)
    gameStore.setExamRef(nextExamRef)
  }

  const handleExamRefChange = (nextExamRef: string) => {
    gameStore.setExamRef(nextExamRef)
    gameStore.setCategory(null)
  }

  const toggleAssistant = () => {
    setAssistantMounted(true)
    setAssistantOpen((open) => !open)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 md:px-6 md:pb-10 md:pt-8 xl:px-8">
      <header className="mb-5 flex animate-fadeUp items-center gap-3 md:mb-6">
        <div className="shrink-0 rounded-2xl bg-[var(--focus)]/10 px-2 pt-1">
          <BilgeChan pose="reading" height={64} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--focus-text)]">DERS ÇALIŞ</p>
          <h1 className="text-xl font-extrabold text-[var(--text)] md:text-2xl">Bugün neyi ilerletelim?</h1>
          <p className="mt-0.5 text-xs text-[var(--text-sub)]">
            Planın hazır; bir ders seç ve tek dokunuşla başla.
          </p>
        </div>
      </header>

      <StudyContextSelector
        games={availableGames}
        selectedGame={game}
        examRefs={examRefs}
        selectedExamRef={examRef}
        onGameChange={handleGameChange}
        onExamRefChange={handleExamRefChange}
      />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-6">
        <section aria-label="Çalışma planın" className="min-w-0 space-y-4">
          <TodayPlanFocus
            game={game}
            userId={user.id}
            examRef={examRef}
            selectedCategory={null}
            showStickyMobileAction
          />
          <MasteryActionCard game={game} userId={user.id} examRef={examRef} />
        </section>

        <aside className="lg:sticky lg:top-[calc(var(--navbar-h)+1.5rem)]">
          <section
            aria-labelledby="study-assistant-title"
            className="animate-fadeUp overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm"
            style={{ animationDelay: '0.4s', animationFillMode: 'both' }}
          >
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-xl" aria-hidden="true">🦉</span>
                <div className="min-w-0">
                  <h2 id="study-assistant-title" className="text-xs font-extrabold tracking-wide text-[var(--text)]">
                    Bilge Asistan
                  </h2>
                  <p className="truncate text-[10px] text-[var(--text-sub)]">Takıldığın yerde kısa yardım al</p>
                </div>
              </div>
              <button
                type="button"
                aria-expanded={assistantOpen}
                aria-controls="study-assistant-body"
                onClick={toggleAssistant}
                className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-xs font-bold text-[var(--focus-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] md:hidden"
              >
                {assistantOpen ? 'Kapat' : 'Asistanı aç'}
              </button>
              <span className="hidden rounded-full bg-[var(--focus)]/10 px-2 py-1 text-[10px] font-bold text-[var(--focus-text)] md:inline">
                Hazır
              </span>
            </div>

            <div
              id="study-assistant-body"
              className={assistantOpen ? 'block' : 'hidden md:block'}
            >
              {assistantMounted && <StudyAssistant embedded game={game} examRef={examRef} />}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

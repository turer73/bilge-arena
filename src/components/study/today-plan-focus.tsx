'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { GameSlug } from '@/lib/constants/games'
import { useTodayPlan } from '@/lib/hooks/use-today-plan'
import { TodayPlanCard } from '@/components/game/today-plan-card'
import { useGameStore } from '@/stores/game-store'
import { isPaperModeUiEnabled, paperPackCreateHref } from '@/lib/paper-mode/client'

interface TodayPlanFocusProps {
  game: GameSlug
  userId?: string | null
  examRef?: string | null
  selectedCategory?: string | null
  showStickyMobileAction?: boolean
}

export function TodayPlanFocus({
  game,
  userId,
  examRef,
  selectedCategory,
  showStickyMobileAction = false,
}: TodayPlanFocusProps) {
  const router = useRouter()
  const gameStore = useGameStore()
  const { plan, loading } = useTodayPlan(game, userId, examRef, selectedCategory)

  if (!userId) return null

  const openGame = () => {
    gameStore.setGame(game)
    gameStore.setExamRef(examRef ?? null)
    gameStore.setCategory(null)
    router.push(`/arena/${game}`)
  }

  if (!loading && (!plan || plan.questions.length === 0)) {
    const showDiagnostic = game === 'matematik' && examRef === 'TYT'
    return (
      <div
        className="animate-fadeUp overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]"
        style={{ animationDelay: '0.28s', animationFillMode: 'both' }}
      >
        <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
          <span className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--text-sub)]">
            BUGÜNÜN PLANI
          </span>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-bold text-[var(--text)]">Bu bağlam için hazır plan bulunamadı</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-sub)]">
            Derse girerek bir çalışma oturumu başlatabilir ve sonraki planını oluşturabilirsin.
          </p>
          <button
            type="button"
            onClick={openGame}
            className="btn-primary mt-4 min-h-12 rounded-xl px-6 text-sm font-bold tracking-wide"
          >
            Derse Başla
          </button>
          {showDiagnostic && (
            <Link
              href="/arena/tani"
              className="mx-auto mt-2 flex min-h-11 w-fit items-center px-3 text-xs font-bold text-[var(--focus-text)] hover:underline"
            >
              Önce 10 soruluk kısa tanılama yap
            </Link>
          )}
        </div>
      </div>
    )
  }

  const startPlan = () => {
    if (!plan || plan.questions.length === 0) return
    gameStore.setGame(game)
    gameStore.setMode('practice')
    gameStore.setCategory(null)
    gameStore.setDifficulty(null)
    gameStore.setExamRef(plan.examRef ?? examRef ?? null)
    router.push(`/arena/${game}?start=today-plan`)
  }

  return (
    <TodayPlanCard
      plan={plan}
      loading={loading}
      onStart={startPlan}
      showStickyMobileAction={showStickyMobileAction}
      paperHref={isPaperModeUiEnabled() && plan
        ? paperPackCreateHref(game, plan.examRef ?? examRef)
        : null}
    />
  )
}

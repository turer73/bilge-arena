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
        className="animate-fadeUp overflow-hidden rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-border)]"
        style={{ animationDelay: '0.28s', animationFillMode: 'both' }}
      >
        <div className="border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card-sunken)] px-4 py-3">
          <span className="text-[10px] font-black tracking-[0.16em] text-[var(--app-text-sub)]">
            BUGÜNÜN PLANI
          </span>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-black text-[var(--app-text)]">Bu bağlam için hazır plan bulunamadı</p>
          <p className="mx-auto mt-1 max-w-sm text-xs font-semibold leading-relaxed text-[var(--app-text-sub)]">
            Derse girerek bir çalışma oturumu başlatabilir ve sonraki planını oluşturabilirsin.
          </p>
          <button
            type="button"
            onClick={openGame}
            className="mt-4 min-h-12 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black tracking-wide text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
          >
            Derse Başla
          </button>
          {showDiagnostic && (
            <Link
              href="/arena/tani"
              className="mx-auto mt-2 flex min-h-11 w-fit items-center px-3 text-xs font-black text-[var(--app-accent-text)] hover:underline"
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

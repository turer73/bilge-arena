'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { GameSlug } from '@/lib/constants/games'
import { useTodayPlan } from '@/lib/hooks/use-today-plan'
import { TodayPlanCard } from '@/components/game/today-plan-card'
import { useGameStore } from '@/stores/game-store'
import { isPaperModeUiEnabled, paperPackCreateHref } from '@/lib/paper-mode/client'
import { questionExamRefForGame } from '@/lib/constants/exam-types'
import { isTytSocialV2ClientEnabled } from '@/lib/feature-flags/tyt-social-v2-client'
import { useTytSocialExamPolicy, type TytSocialExamPolicyState } from '@/lib/hooks/use-tyt-social-exam-policy'
import { TytSocialExamPolicyCardView } from './tyt-social-exam-policy-card'

interface TodayPlanFocusProps {
  game: GameSlug
  userId?: string | null
  examRef?: string | null
  selectedCategory?: string | null
  showStickyMobileAction?: boolean
  /** Reuse the study page's policy read and form instead of fetching twice. */
  tytSocialPolicy?: TytSocialExamPolicyState
}

export function TodayPlanFocus(props: TodayPlanFocusProps) {
  const { game, userId, examRef, selectedCategory } = props
  if (!userId) return null

  const questionExamRef = questionExamRefForGame(game, examRef, isTytSocialV2ClientEnabled())
  const contextKey = `${userId}:${game}:${questionExamRef ?? ''}:${selectedCategory ?? ''}`
  if (game === 'sosyal' && questionExamRef === 'TYT' && isTytSocialV2ClientEnabled()) {
    return <SocialTodayPlanFocus key={contextKey} {...props} examRef={questionExamRef} />
  }
  return <TodayPlanContent key={contextKey} {...props} />
}

function SocialTodayPlanFocus(props: TodayPlanFocusProps) {
  const ownPolicy = useTytSocialExamPolicy({
    game: props.game,
    examRef: props.examRef,
    enabled: !props.tytSocialPolicy,
  })
  const policy = props.tytSocialPolicy ?? ownPolicy
  const ready = policy.eligible && policy.status === 'active' && !policy.loading && !policy.saving
  const selectionKey = `${policy.policyVersion}:${policy.selectionEffectiveAt}:${policy.variantCode}`

  return (
    <div className="space-y-3">
      {!props.tytSocialPolicy && <TytSocialExamPolicyCardView policy={policy} />}
      {ready ? (
        // A newly saved selection gets a fresh read; never reuse another branch's plan.
        <TodayPlanContent key={selectionKey} {...props} />
      ) : (
        <p role="status" className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 text-sm font-semibold text-[var(--app-text-sub)]">
          {policy.loading || policy.saving
            ? 'Cevaplama düzeni doğrulanırken günlük plan bekliyor.'
            : 'Günlük plan için TYT Sosyal cevaplama düzenini karttan doğrula.'}
        </p>
      )}
    </div>
  )
}

function TodayPlanContent({
  game,
  userId,
  examRef,
  selectedCategory,
  showStickyMobileAction = false,
}: TodayPlanFocusProps) {
  const router = useRouter()
  const gameStore = useGameStore()
  const questionExamRef = questionExamRefForGame(game, examRef, isTytSocialV2ClientEnabled())
  const { plan, loading, fetchPlan } = useTodayPlan(game, userId, questionExamRef, selectedCategory)

  const openGame = () => {
    gameStore.setGame(game)
    if (game !== 'wordquest') gameStore.setExamRef(questionExamRef)
    gameStore.setCategory(null)
    const params = new URLSearchParams()
    if (questionExamRef) params.set('exam_ref', questionExamRef)
    router.push(`/arena/${game}${params.size ? `?${params}` : ''}`)
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
            Bu ders ve sınav için günlük plan şu anda kullanılamıyor. Yeniden deneyebilir veya konunu kendin seçebilirsin.
          </p>
          <button
            type="button"
            onClick={openGame}
            className="mt-4 min-h-12 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black tracking-wide text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
          >
            Konumu kendim seçeyim
          </button>
          <button
            type="button"
            onClick={() => void fetchPlan()}
            className="mx-auto mt-2 block min-h-11 px-3 text-xs font-black text-[var(--app-accent-text)] hover:underline"
          >
            Planı yeniden dene
          </button>
          {showDiagnostic && (
            <Link
              href="/arena/tani?game=matematik&exam_ref=TYT"
              className="mx-auto mt-2 flex min-h-11 w-fit items-center px-3 text-xs font-black text-[var(--app-accent-text)] hover:underline"
            >
              Önce 10 soruluk kısa başlangıç taraması yap
            </Link>
          )}
        </div>
      </div>
    )
  }

  const startPlan = () => {
    if (!plan || plan.questions.length === 0) return
    if (!plan.expiresAt || Date.parse(plan.expiresAt) <= Date.now()) {
      void fetchPlan()
      return
    }
    gameStore.setGame(game)
    gameStore.setMode('practice')
    gameStore.setCategory(null)
    gameStore.setDifficulty(null)
    if (game !== 'wordquest') gameStore.setExamRef(plan.examRef ?? questionExamRef)
    const params = new URLSearchParams({ start: 'today-plan' })
    if (game !== 'wordquest' && (plan.examRef ?? questionExamRef)) params.set('exam_ref', (plan.examRef ?? questionExamRef)!)
    router.push(`/arena/${game}?${params}`)
  }

  return (
    <TodayPlanCard
      plan={plan}
      loading={loading}
      onStart={startPlan}
      showStickyMobileAction={showStickyMobileAction}
      paperHref={isPaperModeUiEnabled() && plan
        ? paperPackCreateHref(game, questionExamRefForGame(game, plan.examRef ?? questionExamRef, isTytSocialV2ClientEnabled()))
        : null}
    />
  )
}

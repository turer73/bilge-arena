'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { useGameStore } from '@/stores/game-store'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { useQuizGame } from '@/lib/hooks/use-quiz-game'
import { useSidebarData } from '@/lib/hooks/use-sidebar-data'
import { submitQuestionReport } from '@/lib/questions/submit-report'
import { useSessionSaver } from '@/lib/hooks/use-session-saver'
import { useQuizLimit } from '@/lib/hooks/use-quiz-limit'
import { getLevelFromXP } from '@/lib/constants/levels'
import { defaultExamRefForType } from '@/lib/constants/exam-types'
import { trackLearningEvent } from '@/lib/analytics/learning-events'
import { trackEvent } from '@/lib/utils/plausible'
import { trUpper } from '@/lib/utils/tr-text'
import { isMockStrategyUiEnabled, startMockStrategyAttempt } from '@/lib/mock-strategy/client'
import { isPaperModeUiEnabled, paperPackCreateHref } from '@/lib/paper-mode/client'
import { useMockStrategyResult } from '@/lib/hooks/use-mock-strategy-result'
import { toast } from '@/stores/toast-store'
import { Clock3, Flame, Heart, Sparkles, X } from 'lucide-react'

import { useDailyQuests } from '@/lib/hooks/use-daily-quests'
import { useTodayPlan } from '@/lib/hooks/use-today-plan'
import { usePersonalizedMock } from '@/lib/hooks/use-personalized-mock'
import { useMasteryMap } from '@/lib/hooks/use-mastery-map'

import { Lobby } from './lobby'
import { Timer } from './timer'
import { DenemeTimer } from './deneme-timer'
import { QuestionCard } from './question-card'
import { OptionButton } from './option-button'
import { StreakBadge } from './streak-badge'
import { SoundToggle } from './sound-toggle'
import { XPPopup } from './xp-popup'
import { ExplanationPanel } from './explanation-panel'
import { BilgeChan } from '@/components/ui/bilge-chan'
import { BilgeChanCompanion } from './bilge-chan-companion'

const BurstParticles = dynamic(
  () => import('./burst-particles').then(m => ({ default: m.BurstParticles })),
  { ssr: false },
)
const ResultScreen = dynamic(
  () => import('./result-screen').then(m => ({ default: m.ResultScreen })),
  { ssr: false },
)
const DenemeResult = dynamic(
  () => import('./deneme-result').then(m => ({ default: m.DenemeResult })),
  { ssr: false },
)
import { MiniLeaderboard } from './mini-leaderboard'
import { DailyQuests } from './daily-quests'
import { TodayPlanCard } from './today-plan-card'
import { PersonalizedMockCard } from './personalized-mock-card'
import { MasteryMapCard } from './mastery-map-card'
import { TopicsPanel } from './topics-panel'
import { LifeLostOverlay } from './life-lost-overlay'
import { PremiumGateModal } from '@/components/premium/premium-gate-modal'
import { AdBanner } from '@/components/ads/ad-banner'
import dynamic from 'next/dynamic'
import { ComponentErrorBoundary } from '@/components/ui/error-boundary'

const CommentSection = dynamic(
  () => import('@/components/social/comment-section').then(m => ({ default: m.CommentSection })),
  { ssr: false },
)
const ErrorReportModal = dynamic(
  () => import('@/components/social/error-report-modal').then(m => ({ default: m.ErrorReportModal })),
  { ssr: false },
)

interface QuizEngineProps {
  game: GameSlug
}

export function QuizEngine({ game }: QuizEngineProps) {
  const gameDef = GAMES[game]
  const quizStore = useQuizStore()
  const gameStore = useGameStore()
  const { user, profile } = useAuthStore()
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [verifiedExamAttemptId, setVerifiedExamAttemptId] = useState<string | null>(null)
  // "Bugunun 15'i" plani oynanirken true. Plan, yalnizca dogrulanmis oturum
  // basariyla kaydedilince tamamlanir; lobby'ye donunce sifirlanir.
  const planActiveRef = useRef(false)
  const directPlanStartConsumedRef = useRef(false)

  // --- Custom hooks ---
  const quizLimit = useQuizLimit()
  const quiz = useQuizGame(game, user?.id)
  const sidebar = useSidebarData({ userId: user?.id, game, gameDef })
  const dailyQuests = useDailyQuests()
  const todayPlan = useTodayPlan(
    game,
    user?.id,
    gameStore.selectedExamRef,
    gameStore.selectedCategory,
  )
  const personalizedMock = usePersonalizedMock(game, user?.id, gameStore.selectedExamRef)
  const masteryMap = useMasteryMap(game, user?.id, gameStore.selectedExamRef)
  const sessionSaver = useSessionSaver({
    screen: quiz.screen,
    userId: user?.id,
    attemptId: quiz.attemptId,
    game,
    selectedMode: gameStore.selectedMode,
    selectedCategory: gameStore.selectedCategory,
    selectedDifficulty: gameStore.selectedDifficulty,
    onSessionSaved: (result) => {
      dailyQuests.updateProgress(result)
      void masteryMap.fetchMastery()
      if (planActiveRef.current) {
        const activePlan = todayPlan.plan
        const answeredIds = [
          ...new Set(
            useQuizStore
              .getState()
              .answers.map((answer) => answer.questionId)
              .filter((questionId): questionId is string => Boolean(questionId)),
          ),
        ]
        if (answeredIds.length > 0) void todayPlan.markCompleted(answeredIds)

        // This event means every assigned plan question is covered by a
        // server-verified session or earlier persisted progress. Question IDs
        // remain local; analytics receives aggregate counts only.
        if (activePlan) {
          const planIds = new Set(activePlan.questions.map((question) => question.id))
          const completedAfter = new Set(
            [...activePlan.completedIds, ...answeredIds].filter((id) => planIds.has(id)),
          )
          if (planIds.size > 0 && completedAfter.size === planIds.size) {
            trackLearningEvent('LearningPlanCompleted', {
              game,
              answeredCount: result.totalQuestions,
              correctCount: result.correctAnswers,
              accuracyPercent: result.accuracy,
            })
          }
        }
      }
    },
  })
  const strategyResult = useMockStrategyResult({
    enabled: verifiedExamAttemptId === quiz.attemptId && isMockStrategyUiEnabled(),
    analysisEnabled: quiz.strategyTracked === true,
    attemptId: quiz.attemptId,
    sessionId: sessionSaver?.savedSession?.sessionId ?? null,
    plannedCount: quizStore.questions.length,
  })

  const startTodayPlan = useCallback(() => {
    if (personalizedMock.loading) return false
    const plan = todayPlan.plan
    if (!plan || plan.questions.length === 0) return false
    if (!quizLimit.canPlay) {
      setShowPremiumModal(true)
      return true
    }

    const completedIds = new Set(plan.completedIds)
    const remainingQuestions = plan.questions.filter((question) => !completedIds.has(question.id))
    // Tamamlanan planda "Tekrar Çöz" tüm seti; kısmi planda "Devam Et" yalnız kalanı açar.
    const questionsToStart = remainingQuestions.length > 0 ? remainingQuestions : plan.questions

    trackEvent('UserQuizStart', {
      props: {
        game,
        mode: 'practice',
        category: 'all',
        difficulty: 'all',
        exam_ref: plan.examRef ?? gameStore.selectedExamRef ?? defaultExamRefForType(profile?.exam_type) ?? 'all',
      },
    })
    trackLearningEvent('LearningPlanStarted', {
      game,
      planSize: plan.questions.length,
      completedBefore: plan.completedIds.length,
      examRef: plan.examRef,
    })
    gameStore.setMode('practice')
    gameStore.setCategory(null)
    gameStore.setDifficulty(null)
    gameStore.setExamRef(plan.examRef ?? gameStore.selectedExamRef ?? defaultExamRefForType(profile?.exam_type))
    planActiveRef.current = true
    setVerifiedExamAttemptId(null)
    quiz.handleStartPlanned(questionsToStart, plan.attemptId)
    return true
  }, [
    game,
    gameStore,
    personalizedMock.loading,
    profile?.exam_type,
    quiz,
    quizLimit.canPlay,
    todayPlan.plan,
  ])

  // Ders Çalış CTA'sından gelen tek-kullanımlık niyeti, doğrulanmış plan bileti
  // yüklendikten sonra mevcut güvenli başlatma yoluna bağla. URL hemen temizlenir;
  // geri/yenile ve StrictMode aynı planı ikinci kez başlatamaz.
  useEffect(() => {
    if (
      directPlanStartConsumedRef.current
      || quiz.screen !== 'lobby'
      || todayPlan.loading
      || personalizedMock.loading
      || typeof window === 'undefined'
    ) return

    const url = new URL(window.location.href)
    if (url.searchParams.get('start') !== 'today-plan') return

    directPlanStartConsumedRef.current = true
    url.searchParams.delete('start')
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )

    if (!todayPlan.plan || todayPlan.plan.questions.length === 0) {
      toast.error('Bugünün planı yüklenemedi. Ders lobisinden tekrar deneyebilirsin.')
      return
    }
    // Effect gövdesindeki senkron React state güncellemesini ertele. Bu iş kasıtlı
    // olarak cleanup'ta iptal edilmez: StrictMode'un ilk deneme cleanup'ı URL
    // niyetini tükettiği için ikinci effect aynı başlangıcı yeniden planlayamaz.
    queueMicrotask(() => startTodayPlan())
  }, [
    personalizedMock.loading,
    quiz.screen,
    startTodayPlan,
    todayPlan.loading,
    todayPlan.plan,
  ])

  // Lobiye donulunce plan-aktif bayragini sifirla (handleRestart'in TUM
  // cagri-noktalarini (result/deneme-result/misafir-CTA) tek tek sarmalamak
  // yerine screen-gecisine bagli -- use-session-saver'daki savedRef reset
  // deseniyle ayni yaklasim).
  useEffect(() => {
    if (quiz.screen === 'lobby') {
      planActiveRef.current = false
    }
  }, [quiz.screen])

  // Mobil lobi ve aktif oyunda masaustu ust navigasyonu yerine ekrana ozel,
  // dikkat dagitmayan uygulama kabugunu kullan. Cleanup rota/ekran degisiminde
  // global gezinmeyi geri getirir.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const shellClass = quiz.screen === 'game'
      ? 'mobile-quiz-active'
      : quiz.screen === 'lobby'
        ? 'mobile-quiz-lobby'
        : quiz.screen === 'loading'
          ? 'mobile-quiz-loading'
          : quiz.screen === 'result'
            ? 'mobile-quiz-result'
        : null
    if (!shellClass) return
    document.body.classList.add(shellClass)
    return () => document.body.classList.remove(shellClass)
  }, [quiz.screen])

  // Kullanicinin gercek XP ve streak degerleri
  const userXP = profile?.total_xp ?? 0
  const userStreak = profile?.current_streak ?? 0

  // --- LOBBY ---
  if (quiz.screen === 'lobby') {
    return (
      <>
        <style>{`
          body.mobile-quiz-lobby [data-app-navbar] { display: none !important; }
          body.mobile-quiz-lobby [data-arena-main] {
            padding-top: 0 !important;
            background: var(--app-bg);
          }
        `}</style>
        {user && (
          <div className="mx-auto max-w-md space-y-3 px-4 pt-4 md:max-w-lg md:px-6 xl:max-w-xl xl:px-8 2xl:max-w-2xl">
            <TodayPlanCard
              plan={todayPlan.plan}
              loading={todayPlan.loading}
              paperHref={isPaperModeUiEnabled() && todayPlan.plan
                ? paperPackCreateHref(game, todayPlan.plan.examRef ?? gameStore.selectedExamRef)
                : null}
              onStart={startTodayPlan}
            />
            <PersonalizedMockCard
              loading={personalizedMock.loading}
              error={personalizedMock.error}
              onStart={async () => {
                if (!quizLimit.canPlay) {
                  setShowPremiumModal(true)
                  return
                }

                const plan = await personalizedMock.generate()
                if (!plan) return

                let strategyTracked = false
                let shouldFinalizeVerifiedExam = false
                if (plan.strategyEligible === true && isMockStrategyUiEnabled()) {
                  const started = await startMockStrategyAttempt(plan.attemptId, crypto.randomUUID())
                  if (!started) {
                    toast.error(
                      'Deneme başlatılamadı',
                      'Doğrulanmış deneme başlangıcı kaydedilemedi. Lütfen tekrar dene.',
                    )
                    return
                  }
                  shouldFinalizeVerifiedExam = true
                  strategyTracked = started.trackingEnabled
                }

                trackEvent('UserQuizStart', {
                  props: {
                    game,
                    mode: 'deneme',
                    source: 'personalized_mock',
                    category: 'all',
                    difficulty: 'all',
                    exam_ref: plan.examRef ?? 'all',
                    wrong_count: plan.breakdown.wrong,
                    weak_count: plan.breakdown.weak,
                  },
                })
                gameStore.setMode('deneme')
                gameStore.setCategory(null)
                gameStore.setDifficulty(null)
                planActiveRef.current = false
                setVerifiedExamAttemptId(shouldFinalizeVerifiedExam ? plan.attemptId : null)
                if (strategyTracked) {
                  quiz.handleStartPreparedDeneme(plan.questions, plan.attemptId, true)
                } else {
                  quiz.handleStartPreparedDeneme(plan.questions, plan.attemptId)
                }
              }}
            />
            <MasteryMapCard outcomes={masteryMap.outcomes} loading={masteryMap.loading} />
          </div>
        )}
        <Lobby
          game={game}
          selectedMode={gameStore.selectedMode}
          onSelectMode={(m) => gameStore.setMode(m.id)}
          onStart={() => {
            if (personalizedMock.loading) return
            setVerifiedExamAttemptId(null)
            trackEvent(user ? 'UserQuizStart' : 'GuestQuizStart', {
              props: {
                game,
                mode: gameStore.selectedMode,
                category: gameStore.selectedCategory ?? 'all',
                difficulty: gameStore.selectedDifficulty ?? 'all',
                exam_ref: gameStore.selectedExamRef ?? 'all',
              },
            })
            quiz.handleStart()
          }}
          onLimitReached={() => setShowPremiumModal(true)}
          userXP={userXP}
          userStreak={userStreak}
          selectedCategory={gameStore.selectedCategory}
          onSelectCategory={gameStore.setCategory}
          selectedDifficulty={gameStore.selectedDifficulty}
          onSelectDifficulty={gameStore.setDifficulty}
          selectedExamRef={gameStore.selectedExamRef}
          onSelectExamRef={gameStore.setExamRef}
          quizLimit={{
            canPlay: quizLimit.canPlay,
            remaining: quizLimit.remaining,
            isPremium: quizLimit.isPremium,
            isGuest: quizLimit.isGuest,
          }}
          loadError={quiz.loadError}
        />
        <PremiumGateModal
          isOpen={showPremiumModal}
          onClose={() => setShowPremiumModal(false)}
          reason="quiz_limit"
        />
      </>
    )
  }

  // --- LOADING ---
  if (quiz.screen === 'loading') {
    return (
      <>
        <style>{`
          body.mobile-quiz-loading [data-app-navbar],
          body.mobile-quiz-loading [data-bottom-nav] { display: none !important; }
          body.mobile-quiz-loading [data-arena-main] {
            padding: 0 !important;
            background: var(--app-bg);
          }
        `}</style>
        <div className="mx-auto flex min-h-[100dvh] max-w-[520px] flex-col items-center justify-center gap-5 bg-[var(--app-bg)] p-5 text-center text-[var(--app-text)]">
          <div className="relative flex h-48 w-full max-w-[340px] items-center justify-center overflow-hidden rounded-[28px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] shadow-[0_6px_0_var(--app-shadow-accent)]">
            <div className="absolute -right-8 -top-12 h-32 w-32 rounded-full border-[22px] border-[var(--app-accent)]/5" />
            <div className="absolute left-5 top-5 flex items-center gap-1.5 rounded-xl bg-[var(--app-accent-tint)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--app-accent-text)]">
              <Sparkles size={13} fill="currentColor" /> Bilge Çan hazırlıyor
            </div>
            <BilgeChan pose="reading" height={128} className="mt-8 animate-float" priority />
          </div>
          <div>
            <h1 className="text-xl font-black">Sorular hazırlanıyor</h1>
            <p className="mt-1 text-xs font-semibold text-[var(--app-text-sub)]">Seçtiğin moda uygun soruları getiriyoruz.</p>
          </div>
          <div aria-label="Sorular yükleniyor" role="progressbar" className="flex w-full max-w-[280px] gap-2">
            {[0, 1, 2].map((step) => (
              <span
                key={step}
                className="h-2 flex-1 animate-pulse rounded-full bg-[var(--app-accent)]"
                style={{ animationDelay: `${step * 180}ms`, opacity: 1 - step * 0.22 }}
              />
            ))}
          </div>
        </div>
      </>
    )
  }

  // --- RESULT ---
  if (quiz.screen === 'result') {
    const resultShellStyle = (
      <style>{`
        body.mobile-quiz-result [data-app-navbar],
        body.mobile-quiz-result [data-bottom-nav] { display: none !important; }
        body.mobile-quiz-result [data-arena-main] {
          padding: 0 !important;
          background: var(--app-bg);
        }
      `}</style>
    )
    // Misafir önizleme: 1 soru sonrası kayıt CTA
    if (quiz.isGuestMode) {
      const redirectPath = `/arena/${game}`
      return (
        <>
          {resultShellStyle}
          <div className="mx-auto flex min-h-[100dvh] max-w-[440px] flex-col justify-center gap-4 bg-[var(--app-bg)] p-4 text-center text-[var(--app-text)] animate-scaleIn">
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--app-accent)] to-[var(--app-accent-strong)] p-5 pb-7 text-white shadow-[0_7px_0_var(--app-accent-strong)]">
              <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full border-[24px] border-white/10" />
              <BilgeChan pose="wave" height={148} priority className="mx-auto drop-shadow-[0_8px_10px_rgba(15,23,42,.18)]" />
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">İlk turun tamam</p>
              <h2 className="mt-1 text-2xl font-black">Nasıl buldun?</h2>
            </div>
            <div className="rounded-[22px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-5 shadow-[0_5px_0_var(--app-shadow-accent)]">
              <p className="text-sm font-semibold leading-6 text-[var(--app-text-sub)]">
                <span className="font-black" style={{ color: gameDef.colorHex }}>{gameDef.name}</span>
                {' '}arenasında yüzlerce soru seni bekliyor. İlerlemeni kaydetmek ve serini korumak için ücretsiz hesap oluştur.
              </p>
              <div className="mt-5 flex w-full flex-col gap-3">
                <a
                  href={`/giris?redirect=${encodeURIComponent(redirectPath)}`}
                  className="flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
                >
                  Ücretsiz Kayıt Ol
                </a>
                <button
                  onClick={quiz.handleRestart}
                  className="min-h-12 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] text-sm font-black text-[var(--app-text-sub)] shadow-[0_4px_0_var(--app-shadow)] active:translate-y-1 active:shadow-none"
                >
                  Tekrar Dene
                </button>
              </div>
              <p className="mt-4 text-xs font-semibold text-[var(--app-text-muted)]">
                Zaten hesabın var mı?{' '}
                <a href={`/giris?redirect=${encodeURIComponent(redirectPath)}`} className="font-black text-[var(--app-accent-text)] underline underline-offset-2">Giriş yap</a>
              </p>
            </div>
          </div>
        </>
      )
    }

    if (quiz.isDeneme && quiz.denemeConfig) {
      return (
        <>
          {resultShellStyle}
          <DenemeResult
            gameName={gameDef.name}
            totalTime={quiz.denemeConfig.totalTime}
            elapsedTime={quiz.elapsed.getElapsed()}
            strategyAnalysis={strategyResult.result?.analysis ?? null}
            onRestart={quiz.handleRestart}
            onExit={quiz.handleRestart}
          />
        </>
      )
    }
    return (
      <>
        {resultShellStyle}
        <ResultScreen
          onRestart={quiz.handleRestart}
          onExit={quiz.handleRestart}
          coinsEarned={sessionSaver.savedSession?.coinsEarned ?? null}
        />
        <ComponentErrorBoundary label="Reklam" variant="minimal">
          <div className="mx-auto max-w-[728px] px-4 pb-6">
            <AdBanner slot="result" />
          </div>
        </ComponentErrorBoundary>
      </>
    )
  }

  // --- GAME ---
  const question = quizStore.currentQuestion()
  if (!question) return null

  const lastAnswer = quizStore.answers[quizStore.answers.length - 1]
  const level = getLevelFromXP(quizStore.xpEarned)
  const questionProgress = ((quizStore.currentIndex + 1) / Math.max(1, quizStore.questions.length)) * 100

  // Sidebar görev verileri — gerçek günlük görevler varsa onları kullan
  const fallbackQuests = [
    { label: '10 soru çöz', done: quizStore.currentIndex + 1, total: 10, color: 'var(--focus)' },
    { label: '3 seri yap', done: Math.min(quizStore.maxStreak, 3), total: 3, color: 'var(--reward)' },
    { label: `${gameDef.name} oyna`, done: 1, total: 1, color: 'var(--growth)' },
  ]

  // Konu gucu: gercek veri varsa onu kullan, yoksa kategorileri %0 goster
  const sidebarTopics = sidebar.topicData.length > 0
    ? sidebar.topicData
    : gameDef.categories.map((cat) => ({
        label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '),
        percentage: 0,
      }))

  return (
    <>
    <style>{`
      body.mobile-quiz-active [data-app-navbar],
      body.mobile-quiz-active [data-bottom-nav] { display: none !important; }
      body.mobile-quiz-active [data-arena-main] {
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        background: var(--app-bg);
      }
    `}</style>
    {/* Can kaybi kirmizi flash */}
    {quiz.showLifeLost && <LifeLostOverlay />}

    <div className="mx-auto min-h-[100dvh] max-w-[440px] bg-[var(--app-bg)] p-3 text-[var(--app-text)]">
      {/* Mobil odak modu: ilerleme, süre ve oturum kaynakları tek bakışta. */}
      <header
        className="sticky top-0 z-30 -mx-3 -mt-3 mb-3 overflow-hidden rounded-b-[24px] px-3 pb-2.5 pt-[max(8px,env(safe-area-inset-top))] text-white shadow-[0_5px_0_rgba(29,78,216,.28)]"
        style={{ background: `linear-gradient(135deg, ${gameDef.colorHex}, ${gameDef.colorHex}d9)` }}
      >
        <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full border-[20px] border-white/10" />
        <div className="flex min-h-12 items-center gap-2.5">
          <button
            type="button"
            onClick={quiz.handleRestart}
            aria-label="Oyundan çık"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-white/30 bg-white/15 text-white shadow-[0_3px_0_rgba(15,23,42,.14)] active:translate-y-0.5"
          >
            <X size={20} strokeWidth={3} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.1em]">
              <span className="truncate text-white">{gameDef.name} · {quiz.mode.name}</span>
              <span className="shrink-0 text-white/80">{quizStore.currentIndex + 1} / {quizStore.questions.length}</span>
            </div>
            <div
              role="progressbar"
              aria-label="Oyun ilerlemesi"
              aria-valuemin={1}
              aria-valuemax={quizStore.questions.length}
              aria-valuenow={quizStore.currentIndex + 1}
              className="h-3 overflow-hidden rounded-full bg-black/15 p-[2px]"
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${questionProgress}%`, background: '#ffffff' }}
              />
            </div>
          </div>

          {!quiz.isDeneme && quiz.mode.timePerQuestion > 0 && (
            <div
              aria-label={`Kalan süre: ${quiz.timer.seconds} saniye`}
              className="relative flex h-11 min-w-12 shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-white/30 bg-white/15 px-2 text-white shadow-[0_3px_0_rgba(15,23,42,.14)]"
            >
              <span className="flex items-center gap-1 text-[9px] font-black uppercase"><Clock3 size={11} /> sn</span>
              <span className="text-sm font-black tabular-nums">{quiz.timer.seconds}</span>
            </div>
          )}
        </div>

        {!quiz.isDeneme && (
          <div className="relative mt-1 flex items-center justify-between rounded-2xl bg-black/10 px-3 py-1.5 text-[11px] font-black">
            <div className="flex items-center gap-3">
              {quizStore.livesEnabled && (
                <span aria-label={`${quizStore.lives} can`} className="flex items-center gap-1 text-white">
                  <Heart size={15} fill="currentColor" />{quizStore.lives}
                </span>
              )}
              <span aria-label={`${quizStore.streak} seri`} className="flex items-center gap-1 text-[var(--app-warn-border)]">
                <Flame size={15} fill="currentColor" />{quizStore.streak}
              </span>
              <span aria-label={`${quizStore.xpEarned} oturum XP`} className="flex items-center gap-1 text-[var(--wisdom-bg)]">
                <Sparkles size={15} fill="currentColor" />+{quizStore.xpEarned} XP
              </span>
            </div>
            <SoundToggle />
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3">
      {/* Sol sutun */}
      <div className="flex flex-col gap-3">
        {/* Mobil companion (lg altinda, yatay-compact) */}
        {!quiz.isDeneme && (
          <BilgeChanCompanion
            key={`m-${quizStore.currentIndex}`}
            attemptId={quiz.attemptId}
            quizState={quizStore.state}
            lastIsCorrect={lastAnswer?.isCorrect ?? null}
            question={question}
            correctOption={lastAnswer?.correctOption ?? null}
            onHelpToggle={quiz.setHelpPaused}
            compact
            height={108}
          />
        )}
        {/* Deneme timer */}
        {quiz.isDeneme && quiz.denemeConfig && (
          <div className="animate-fadeUp rounded-[20px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-3 text-[var(--app-text)] shadow-[0_4px_0_var(--app-shadow-accent)]">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest text-[var(--text-sub)]">
                DENEME SINAVI — {trUpper(gameDef.name)}
              </span>
              <span className="text-xs font-bold text-[var(--text-sub)]">
                {quizStore.currentIndex + 1}/{quizStore.questions.length}
              </span>
            </div>
            <DenemeTimer
              totalTime={quiz.denemeConfig.totalTime}
              onTimeUp={quiz.handleDenemeTimeUp}
              isPaused={quiz.screen !== 'game'}
            />
          </div>
        )}

        {/* Profil seridi (normal mod) */}
        {!quiz.isDeneme && (
          <div className="hidden">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full border-2 text-lg"
                style={{
                  background: `linear-gradient(135deg, ${gameDef.colorHex}44, ${gameDef.colorHex})`,
                  borderColor: `${gameDef.colorHex}55`,
                }}
              >
                {level.badge}
              </div>
              <div>
                <div className="text-[13px] font-bold">{gameDef.name}</div>
                <div className="text-xs text-[var(--text-sub)]">
                  {quizStore.xpEarned} XP kazanildi
                </div>
              </div>
              <div className="flex-1" />

              {/* Can gösterimi — son can pulse, kayıp can heartbreak */}
              {quizStore.livesEnabled && (
                <div className="flex items-center gap-0.5" title={`${quizStore.lives}/${quizStore.maxLives} can`}>
                  {Array.from({ length: quizStore.maxLives }).map((_, i) => {
                    const isAlive = i < quizStore.lives
                    const isLastLife = isAlive && quizStore.lives === 1 && i === 0
                    const justLost = !isAlive && i === quizStore.lives && quiz.showLifeLost

                    return (
                      <span
                        key={i}
                        className={`text-sm ${
                          justLost
                            ? 'animate-heart-break'
                            : isLastLife
                              ? 'animate-last-life-pulse'
                              : isAlive
                                ? 'scale-100 opacity-100 transition-all duration-300'
                                : 'scale-75 opacity-30 grayscale transition-all duration-300'
                        }`}
                      >
                        {isAlive ? '❤️' : '🖤'}
                      </span>
                    )
                  })}
                </div>
              )}

              <SoundToggle />
              <StreakBadge streak={quizStore.streak} />
              <div className="text-right">
                <div className="text-xs tracking-wider text-[var(--text-sub)]">OTURUM</div>
                <div className="font-display text-base font-black text-[var(--reward-text)]">
                  +{quizStore.xpEarned}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aciklama paneli — cevap sonrasi sorunun USTUNDE: "Sonraki Soru"
            kaydirmadan erisilebilir (mobil/desktop). Deneme'de de gosterilir:
            otomatik ilerleme kaldirildi, kullanici butonla gecer (Ensar 06-16). */}
        {quizStore.state === 'answered' && lastAnswer && (
          <>
            <ExplanationPanel
              question={question}
              selectedOption={lastAnswer.selectedOption}
              isCorrect={lastAnswer.isCorrect}
              correctOption={lastAnswer.correctOption}
              solution={lastAnswer.solution}
              isLastQuestion={quizStore.isLastQuestion() || quizStore.livesExhausted}
              onNext={quiz.handleNext}
              onOpenComments={() => quiz.setShowComments(!quiz.showComments)}
              onOpenReport={() => quiz.setShowReportModal(true)}
            />

            {quiz.showComments && (
              <ComponentErrorBoundary label="Yorumlar" variant="inline">
                <CommentSection questionId={question.id} isLoggedIn={!!user} />
              </ComponentErrorBoundary>
            )}
          </>
        )}

        {/* Hata bildirimi — oyun boyunca mount (cevaptan BAĞIMSIZ raporlama:
            QuestionCard'daki "Bildir" butonu + ExplanationPanel "🐛" tetikler).
            Önceden yalnız answered'da mount'tu → denemede cevaplamadan rapor
            atılamıyordu (Ensar 06-16). */}
        <ComponentErrorBoundary label="Hata Bildirimi" variant="minimal">
          <ErrorReportModal
            questionId={question.id}
            isOpen={quiz.showReportModal}
            onClose={() => quiz.setShowReportModal(false)}
            // #379 + P1 fix (Codex PR#242): AWAIT'li gönderim, res.ok'a göre {ok,error}
            // → modal sahte başarı göstermez. Mantık test-edilebilir helper'a çıkarıldı.
            onSubmit={(data: { type: string; description: string }) => submitQuestionReport(question.id, data)}
          />
        </ComponentErrorBoundary>

        {/* Soru + Timer */}
          <div className="flex flex-col-reverse gap-3 animate-fadeUp" style={{ animationDelay: '0.08s', animationFillMode: 'both' }}>
          <div className="flex-1">
            <QuestionCard
              question={question}
              currentIndex={quizStore.currentIndex}
              totalQuestions={quizStore.questions.length}
              onReport={() => quiz.setShowReportModal(true)}
            >
              {quiz.showBurst && <BurstParticles />}
            </QuestionCard>
          </div>

          {/* Per-question timer kutusu */}
          {!quiz.isDeneme && quiz.mode.timePerQuestion > 0 && (
            <div className="hidden">
              <Timer seconds={quiz.timer.seconds} total={quiz.mode.timePerQuestion} />
              <span className="text-xs font-bold tracking-wider text-[var(--text-sub)]">SN</span>
            </div>
          )}
        </div>

        {/* Secenekler */}
        <div className="flex flex-col gap-2">
          {question.content.options.map((opt, idx) => (
            <OptionButton
              key={`${quizStore.currentIndex}-${idx}`}
              index={idx}
              text={opt}
              state={quiz.getOptionState(idx)}
              onClick={() => quiz.handleAnswer(idx)}
              delay={idx * 55}
            />
          ))}
        </div>

        {/* XP popup */}
        {!quiz.isDeneme && quiz.showXPPopup && quizStore.lastXPResult && (
          <div className="relative h-0 overflow-visible">
            <div className="absolute right-4 -top-10">
              <XPPopup
                total={quizStore.lastXPResult.total}
                hasBonus={quizStore.lastXPResult.hasBonus}
                streak={quizStore.streak}
              />
            </div>
          </div>
        )}

      </div>

      {/* Sag sidebar */}
      {!quiz.isDeneme && (
        <div className="hidden">
          <BilgeChanCompanion
            key={quizStore.currentIndex}
            attemptId={quiz.attemptId}
            quizState={quizStore.state}
            lastIsCorrect={lastAnswer?.isCorrect ?? null}
            question={question}
            correctOption={lastAnswer?.correctOption ?? null}
            onHelpToggle={quiz.setHelpPaused}
            height={340}
            className="sticky top-4"
          />
          <ComponentErrorBoundary label="Sıralama" variant="inline">
            <MiniLeaderboard players={sidebar.leaderboard} myRank={sidebar.myRank} />
          </ComponentErrorBoundary>
          <ComponentErrorBoundary label="Günlük Görevler" variant="inline">
            <DailyQuests
              quests={dailyQuests.quests.length === 0 ? fallbackQuests : undefined}
              userQuests={dailyQuests.quests.length > 0 ? dailyQuests.quests : undefined}
              onClaimXP={dailyQuests.claimXP}
            />
          </ComponentErrorBoundary>
        </div>
      )}
      </div>

      {/* Konu gucu — tam genislik alt bant (mobilde de gorunur) */}
      {!quiz.isDeneme && (
        <div className="mt-3">
          <ComponentErrorBoundary label="Konu Gücü" variant="inline">
            <TopicsPanel topics={sidebarTopics} />
          </ComponentErrorBoundary>
        </div>
      )}
    </div>
    </>
  )
}

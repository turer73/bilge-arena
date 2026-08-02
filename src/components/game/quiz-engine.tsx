'use client'

import { useState, useEffect } from 'react'
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
import { trackEvent } from '@/lib/utils/plausible'
import { trUpper } from '@/lib/utils/tr-text'

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
  // "Bugunun 15'i" plani oynanirken true -- result ekranina gecince
  // tamamlanan sorular plan'a isaretlenir (bkz. asagidaki effect). Restart'ta
  // (screen tekrar 'lobby'ye donunce) sifirlanir.
  const [planActive, setPlanActive] = useState(false)

  // --- Custom hooks ---
  const quizLimit = useQuizLimit()
  const quiz = useQuizGame(game, user?.id)
  const sidebar = useSidebarData({ userId: user?.id, game, gameDef })
  const dailyQuests = useDailyQuests()
  const todayPlan = useTodayPlan(game, user?.id, gameStore.selectedExamRef)
  const personalizedMock = usePersonalizedMock(game, user?.id, gameStore.selectedExamRef)
  const masteryMap = useMasteryMap(game, user?.id, gameStore.selectedExamRef)
  useSessionSaver({
    screen: quiz.screen,
    userId: user?.id,
    game,
    selectedMode: gameStore.selectedMode,
    selectedCategory: gameStore.selectedCategory,
    selectedDifficulty: gameStore.selectedDifficulty,
    onSessionSaved: (result) => {
      dailyQuests.updateProgress(result)
      void masteryMap.fetchMastery()
    },
  })

  // Lobiye donulunce plan-aktif bayragini sifirla (handleRestart'in TUM
  // cagri-noktalarini (result/deneme-result/misafir-CTA) tek tek sarmalamak
  // yerine screen-gecisine bagli -- use-session-saver'daki savedRef reset
  // deseniyle ayni yaklasim).
  useEffect(() => {
    if (quiz.screen === 'lobby') setPlanActive(false)
  }, [quiz.screen])

  // Plan bitince (result ekrani) o oturumda cevaplanan sorulari plan'a isaretle.
  useEffect(() => {
    if (quiz.screen !== 'result' || !planActive) return
    const answeredIds = useQuizStore.getState().answers.map((a) => a.questionId)
    if (answeredIds.length > 0) todayPlan.markCompleted(answeredIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.screen, planActive])

  // Kullanicinin gercek XP ve streak degerleri
  const userXP = profile?.total_xp ?? 0
  const userStreak = profile?.current_streak ?? 0

  // --- LOBBY ---
  if (quiz.screen === 'lobby') {
    return (
      <>
        {user && (
          <div className="mx-auto max-w-md space-y-3 px-4 pt-4 md:max-w-lg md:px-6 xl:max-w-xl xl:px-8 2xl:max-w-2xl">
            <TodayPlanCard
              plan={todayPlan.plan}
              loading={todayPlan.loading}
              onStart={() => {
                if (personalizedMock.loading) return
                if (!todayPlan.plan || todayPlan.plan.questions.length === 0) return
                if (!quizLimit.canPlay) {
                  setShowPremiumModal(true)
                  return
                }
                trackEvent('UserQuizStart', {
                  props: {
                    game,
                    mode: 'practice',
                    category: 'all',
                    difficulty: 'all',
                    exam_ref: gameStore.selectedExamRef ?? defaultExamRefForType(profile?.exam_type) ?? 'all',
                  },
                })
                gameStore.setMode('practice')
                gameStore.setCategory(null)
                gameStore.setDifficulty(null)
                setPlanActive(true)
                quiz.handleStartPlanned(todayPlan.plan.questions)
              }}
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
                setPlanActive(false)
                quiz.handleStartPreparedDeneme(plan.questions)
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
        <BilgeChan pose="reading" height={120} className="animate-float" priority />
        <p className="text-sm text-[var(--text-sub)] animate-pulse">
          Sorular hazırlanıyor...
        </p>
      </div>
    )
  }

  // --- RESULT ---
  if (quiz.screen === 'result') {
    // Misafir önizleme: 1 soru sonrası kayıt CTA
    if (quiz.isGuestMode) {
      const redirectPath = `/arena/${game}`
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-4 py-16 text-center animate-scaleIn">
          <div className="text-6xl">🎯</div>
          <h2 className="font-display text-2xl font-black">
            Nasıl buldun?
          </h2>
          <p className="text-sm text-[var(--text-sub)]">
            <span className="font-bold" style={{ color: gameDef.colorHex }}>{gameDef.name}</span>
            {' '}arenasında yüzlerce soru seni bekliyor. Ücretsiz hesap oluştur, ilerlemeyi kaydet, sıralamada yüksel.
          </p>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <a
              href={`/giris?redirect=${encodeURIComponent(redirectPath)}`}
              className="flex-1 rounded-[10px] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${gameDef.colorHex}, ${gameDef.colorHex}cc)` }}
            >
              🚀 Ücretsiz Kayıt Ol
            </a>
            <button
              onClick={quiz.handleRestart}
              className="flex-1 rounded-[10px] border border-[var(--border)] py-3 text-sm font-medium text-[var(--text-sub)] transition-colors hover:border-[var(--focus)] hover:text-[var(--focus)]"
            >
              Tekrar Dene
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Zaten hesabın var mı?{' '}
            <a
              href={`/giris?redirect=${encodeURIComponent(redirectPath)}`}
              className="underline hover:text-[var(--focus)]"
            >
              Giriş yap
            </a>
          </p>
        </div>
      )
    }

    if (quiz.isDeneme && quiz.denemeConfig) {
      return (
        <DenemeResult
          gameName={gameDef.name}
          totalTime={quiz.denemeConfig.totalTime}
          elapsedTime={quiz.elapsed.getElapsed()}
          onRestart={quiz.handleRestart}
          onExit={quiz.handleRestart}
        />
      )
    }
    return (
      <>
        <ResultScreen onRestart={quiz.handleRestart} onExit={quiz.handleRestart} />
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
    {/* Can kaybi kirmizi flash */}
    {quiz.showLifeLost && <LifeLostOverlay />}

    <div className="mx-auto max-w-[940px] p-3 md:p-4 lg:p-5 xl:max-w-[1100px] xl:p-6 2xl:max-w-[1280px] 2xl:p-8">
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] xl:gap-5 2xl:grid-cols-[1fr_360px]">
      {/* Sol sutun */}
      <div className="flex flex-col gap-3 md:gap-4 xl:gap-5">
        {/* Mobil companion (lg altinda, yatay-compact) */}
        {!quiz.isDeneme && (
          <BilgeChanCompanion
            key={`m-${quizStore.currentIndex}`}
            quizState={quizStore.state}
            lastIsCorrect={lastAnswer?.isCorrect ?? null}
            question={question}
            correctOption={lastAnswer?.correctOption ?? null}
            onHelpToggle={quiz.setHelpPaused}
            compact
            height={104}
            className="lg:hidden"
          />
        )}
        {/* Deneme timer */}
        {quiz.isDeneme && quiz.denemeConfig && (
          <div className="animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
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
          <div className="animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
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
            onSubmit={(data) => submitQuestionReport(question.id, data)}
          />
        </ComponentErrorBoundary>

        {/* Soru + Timer */}
        <div className="flex flex-col-reverse gap-3 animate-fadeUp sm:flex-row" style={{ animationDelay: '0.08s', animationFillMode: 'both' }}>
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
            <div className="flex min-h-12 items-center gap-2 self-end rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 sm:flex-col sm:self-stretch sm:py-3">
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
        <div className="hidden flex-col gap-3 lg:flex">
          <BilgeChanCompanion
            key={quizStore.currentIndex}
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
        <div className="mt-3 md:mt-4 xl:mt-5">
          <ComponentErrorBoundary label="Konu Gücü" variant="inline">
            <TopicsPanel topics={sidebarTopics} />
          </ComponentErrorBoundary>
        </div>
      )}
    </div>
    </>
  )
}

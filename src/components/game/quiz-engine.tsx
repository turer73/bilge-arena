'use client'

import { useQuizStore } from '@/stores/quiz-store'
import { useGameStore } from '@/stores/game-store'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { useQuizGame } from '@/lib/hooks/use-quiz-game'
import { useSidebarData } from '@/lib/hooks/use-sidebar-data'
import { useSessionSaver } from '@/lib/hooks/use-session-saver'
import { getLevelFromXP } from '@/lib/constants/levels'

import { Lobby } from './lobby'
import { Timer } from './timer'
import { DenemeTimer } from './deneme-timer'
import { QuestionCard } from './question-card'
import { OptionButton } from './option-button'
import { StreakBadge } from './streak-badge'
import { XPPopup } from './xp-popup'
import { BurstParticles } from './burst-particles'
import { ExplanationPanel } from './explanation-panel'
import { ResultScreen } from './result-screen'
import { DenemeResult } from './deneme-result'
import { MiniLeaderboard } from './mini-leaderboard'
import { DailyQuests } from './daily-quests'
import { TopicsPanel } from './topics-panel'
import { CommentSection } from '@/components/social/comment-section'
import { ErrorReportModal } from '@/components/social/error-report-modal'

interface QuizEngineProps {
  game: GameSlug
}

export function QuizEngine({ game }: QuizEngineProps) {
  const gameDef = GAMES[game]
  const quizStore = useQuizStore()
  const gameStore = useGameStore()
  const { user, profile } = useAuthStore()

  // --- Custom hooks ---
  const quiz = useQuizGame(game)
  const sidebar = useSidebarData({ userId: user?.id, game, gameDef })
  useSessionSaver({
    screen: quiz.screen,
    userId: user?.id,
    game,
    selectedMode: gameStore.selectedMode,
    selectedCategory: gameStore.selectedCategory,
    selectedDifficulty: gameStore.selectedDifficulty,
  })

  // Kullanicinin gercek XP ve streak degerleri
  const userXP = profile?.total_xp ?? 0
  const userStreak = profile?.current_streak ?? 0

  // --- LOBBY ---
  if (quiz.screen === 'lobby') {
    return (
      <Lobby
        game={game}
        selectedMode={gameStore.selectedMode}
        onSelectMode={(m) => gameStore.setMode(m.id)}
        onStart={quiz.handleStart}
        userXP={userXP}
        userStreak={userStreak}
      />
    )
  }

  // --- LOADING ---
  if (quiz.screen === 'loading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
        <div
          className="h-12 w-12 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-transparent"
          style={{ borderTopColor: gameDef.colorHex }}
        />
        <p className="text-sm text-[var(--text-sub)] animate-pulse">
          Sorular yukleniyor...
        </p>
      </div>
    )
  }

  // --- RESULT ---
  if (quiz.screen === 'result') {
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
    return <ResultScreen onRestart={quiz.handleRestart} onExit={quiz.handleRestart} />
  }

  // --- GAME ---
  const question = quizStore.currentQuestion()
  if (!question) return null

  const lastAnswer = quizStore.answers[quizStore.answers.length - 1]
  const level = getLevelFromXP(quizStore.xpEarned)

  // Sidebar gorev verileri (quiz state'inden turetilir)
  const sidebarQuests = [
    { label: '10 soru coz', done: quizStore.currentIndex + 1, total: 10, color: 'var(--focus)' },
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
    <div className="mx-auto max-w-[940px] p-3 md:p-4 lg:p-5 xl:max-w-[1100px] xl:p-6 2xl:max-w-[1280px] 2xl:p-8">
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-[1fr_190px] xl:grid-cols-[1fr_220px] xl:gap-5 2xl:grid-cols-[1fr_260px]">
      {/* Sol sutun */}
      <div className="flex flex-col gap-3 md:gap-4 xl:gap-5">
        {/* Deneme timer */}
        {quiz.isDeneme && quiz.denemeConfig && (
          <div className="animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold tracking-widest text-[var(--text-sub)]">
                DENEME SINAVI — {gameDef.name.toUpperCase()}
              </span>
              <span className="text-[10px] font-bold text-[var(--text-sub)]">
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
                <div className="text-[10px] text-[var(--text-sub)]">
                  {quizStore.xpEarned} XP kazanildi
                </div>
              </div>
              <div className="flex-1" />
              <StreakBadge streak={quizStore.streak} />
              <div className="text-right">
                <div className="text-[9px] tracking-wider text-[var(--text-sub)]">OTURUM</div>
                <div className="font-display text-base font-black text-[var(--reward)]">
                  +{quizStore.xpEarned}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Soru + Timer */}
        <div className="flex gap-3 animate-fadeUp" style={{ animationDelay: '0.08s', animationFillMode: 'both' }}>
          <div className="flex-1">
            <QuestionCard
              question={question}
              currentIndex={quizStore.currentIndex}
              totalQuestions={quizStore.questions.length}
            >
              {quiz.showBurst && <BurstParticles />}
            </QuestionCard>
          </div>

          {/* Per-question timer kutusu */}
          {!quiz.isDeneme && quiz.mode.timePerQuestion > 0 && (
            <div className="flex flex-col items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-2.5 py-3">
              <Timer seconds={quiz.timer.seconds} total={quiz.mode.timePerQuestion} />
              <span className="text-[8px] font-bold tracking-wider text-[var(--text-sub)]">SN</span>
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

        {/* Aciklama paneli */}
        {!quiz.isDeneme && quizStore.state === 'answered' && lastAnswer && (
          <>
            <ExplanationPanel
              question={question}
              selectedOption={lastAnswer.selectedOption}
              isCorrect={lastAnswer.isCorrect}
              isLastQuestion={quizStore.isLastQuestion()}
              onNext={quiz.handleNext}
              onOpenComments={() => quiz.setShowComments(!quiz.showComments)}
              onOpenReport={() => quiz.setShowReportModal(true)}
            />

            {quiz.showComments && (
              <CommentSection questionId={question.id} isLoggedIn={!!user} />
            )}

            <ErrorReportModal
              questionId={question.id}
              isOpen={quiz.showReportModal}
              onClose={() => quiz.setShowReportModal(false)}
            />
          </>
        )}
      </div>

      {/* Sag sidebar */}
      {!quiz.isDeneme && (
        <div className="hidden flex-col gap-3 lg:flex">
          <MiniLeaderboard players={sidebar.leaderboard} myRank={sidebar.myRank} />
          <DailyQuests quests={sidebarQuests} />
          <TopicsPanel topics={sidebarTopics} />
        </div>
      )}
      </div>
    </div>
  )
}

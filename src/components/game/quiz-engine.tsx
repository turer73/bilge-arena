'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { useGameStore } from '@/stores/game-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTimer } from '@/lib/hooks/use-timer'
import { calculateXP } from '@/lib/utils/xp'
import { getModeById, DENEME_CONFIGS } from '@/lib/constants/modes'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { fetchQuizQuestions } from '@/lib/supabase/questions'
import { saveGameSession } from '@/lib/supabase/sessions'
import { refreshProfile } from '@/lib/hooks/use-auth'
import type { Question, Difficulty } from '@/types/database'
import type { OptionState } from './option-button'

import { Lobby } from './lobby'
import { Timer } from './timer'
import { DenemeTimer, useElapsedTime } from './deneme-timer'
import { QuestionCard } from './question-card'
import { OptionButton } from './option-button'
import { StreakBadge } from './streak-badge'
import { XPBar } from './xp-bar'
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
import { getLevelFromXP } from '@/lib/constants/levels'

// Demo sorulari — Supabase'de soru yoksa fallback
const DEMO_QUESTIONS: Question[] = [
  {
    id: 'd1', game: 'matematik', category: 'problemler', sub_category: 'Isci-Havuz', difficulty: 2,
    content: { question: 'Bir isi Ahmet 6 gunde, Mehmet 12 gunde bitirebiliyor. Birlikte calisirlarsa kac gunde bitirirler?', options: ['3 gun', '4 gun', '5 gun', '6 gun'], answer: 1, solution: '1/6+1/12 = 1/4 → 4 gun' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd2', game: 'turkce', category: 'anlam', sub_category: 'Anlam', difficulty: 2,
    content: { question: 'Asagidaki cumlelerden hangisinde nesnel yargi bulunmaktadir?', options: ['Bu film cok guzeldir', 'Hava bugun oldukca sicak', "Turkiye'nin yuzolcumu 783.562 km²'dir", 'O roman cok sikiciydi'], answer: 2, solution: "Yuzolcumu olculebilir-dogrulanabilir gercektir → nesnel yargi" },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd3', game: 'fen', category: 'fizik', sub_category: 'Fizik', difficulty: 2,
    content: { question: "Newton'in ikinci yasasina gore 5 kg kutleli cisme 20 N net kuvvet uygulanirsa ivmesi kactir?", options: ['2 m/s²', '4 m/s²', '10 m/s²', '25 m/s²'], answer: 1, solution: 'a = F/m = 20/5 = 4 m/s²' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd4', game: 'sosyal', category: 'tarih', sub_category: 'Tarih', difficulty: 2,
    content: { question: 'Malazgirt Savasi hangi yilda gerceklesmistir?', options: ['1048', '1071', '1096', '1204'], answer: 1, solution: '1071 — Sultan Alparslan vs Bizans; Anadolu kapisi acildi' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd5', game: 'fen', category: 'kimya', sub_category: 'Kimya', difficulty: 3,
    content: { question: 'pH = 2 olan cozeltinin [H⁺] derisimi nedir?', options: ['10⁻¹²', '10⁻⁷', '10⁻²', '10²'], answer: 2, solution: '[H⁺] = 10^(-pH) = 10⁻² mol/L' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
]

interface QuizEngineProps {
  game: GameSlug
}

export function QuizEngine({ game }: QuizEngineProps) {
  const gameDef = GAMES[game]
  const quizStore = useQuizStore()
  const gameStore = useGameStore()
  const { user, profile } = useAuthStore()

  const [screen, setScreen] = useState<'lobby' | 'loading' | 'game' | 'result'>('lobby')
  const [showBurst, setShowBurst] = useState(false)
  const [showXPPopup, setShowXPPopup] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [sessionSaving, setSessionSaving] = useState(false)
  const sessionSavedRef = useRef(false)

  const mode = getModeById(gameStore.selectedMode)
  const isDeneme = mode.isDeneme === true
  const denemeConfig = isDeneme ? DENEME_CONFIGS[game] : null
  const elapsed = useElapsedTime()
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null)

  // Kullanicinin gercek XP ve streak degerleri
  const userXP = profile?.total_xp ?? 0
  const userStreak = profile?.current_streak ?? 0

  // Deneme: sure dolunca tum sinavi bitir
  const handleDenemeTimeUp = useCallback(() => {
    quizStore.completeQuiz()
    setScreen('result')
  }, [quizStore])

  // Normal: Sure dolunca yanlis sayilir
  const handleTimeUp = useCallback(() => {
    const question = quizStore.currentQuestion()
    if (question && quizStore.state === 'playing') {
      const xpResult = calculateXP(question.difficulty, 0, quizStore.streak)
      quizStore.answerQuestion(-1, false, mode.timePerQuestion, xpResult)
    }
  }, [quizStore, mode.timePerQuestion])

  const timer = useTimer({
    initialTime: mode.timePerQuestion,
    onTimeUp: handleTimeUp,
    autoStart: false,
  })

  // Deneme modunda cevap sonrasi otomatik ilerleme
  useEffect(() => {
    if (!isDeneme || quizStore.state !== 'answered') return

    autoAdvanceRef.current = setTimeout(() => {
      if (quizStore.isLastQuestion()) {
        quizStore.completeQuiz()
        setScreen('result')
      } else {
        quizStore.nextQuestion()
      }
    }, 1200)

    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
    }
  }, [isDeneme, quizStore.state, quizStore])

  // Oturum kaydetme — sonuc ekranina gectiginde tetiklenir
  useEffect(() => {
    if (screen !== 'result' || sessionSavedRef.current || sessionSaving) return
    if (!user) return // Misafir kullanici — kaydetme

    const { answers, xpEarned, maxStreak } = useQuizStore.getState()
    if (answers.length === 0) return

    sessionSavedRef.current = true
    setSessionSaving(true)

    saveGameSession({
      userId: user.id,
      game,
      mode: gameStore.selectedMode,
      answers,
      totalXP: xpEarned,
      maxStreak,
      category: gameStore.selectedCategory,
      difficulty: gameStore.selectedDifficulty,
    })
      .then(async (sessionId) => {
        if (sessionId) {
          console.log('[QuizEngine] Oturum kaydedildi:', sessionId)
          // DB trigger'lari XP/level/streak guncelledi → profil verisini yenile
          await refreshProfile()
        }
      })
      .catch((err) => console.error('[QuizEngine] Oturum kaydetme hatasi:', err))
      .finally(() => setSessionSaving(false))
  }, [screen, user, game, gameStore.selectedMode, gameStore.selectedCategory, gameStore.selectedDifficulty, sessionSaving])

  // Sorulari Supabase'den cek ve quiz'i baslat
  const handleStart = useCallback(async () => {
    setScreen('loading')
    sessionSavedRef.current = false

    try {
      // Supabase'den soru cek
      let questions = await fetchQuizQuestions({
        game,
        limit: isDeneme ? mode.questionCount * 2 : mode.questionCount * 3,
        category: gameStore.selectedCategory,
        difficulty: gameStore.selectedDifficulty,
      })

      // Fallback: Supabase'de soru yoksa demo sorulari kullan
      if (questions.length === 0) {
        console.info('[QuizEngine] Supabase bos, fallback DEMO_QUESTIONS')
        questions = DEMO_QUESTIONS.filter(q => q.game === game)
        if (questions.length === 0) questions = [...DEMO_QUESTIONS]
      }

      if (isDeneme && denemeConfig) {
        // Deneme: kategori dagilimina gore sorulari sec
        const distributed: Question[] = []
        for (const [cat, count] of Object.entries(denemeConfig.questionDistribution)) {
          const catQuestions = questions.filter(q => q.category === cat)
          const shuffled = [...catQuestions].sort(() => Math.random() - 0.5)
          distributed.push(...shuffled.slice(0, count))
        }
        // Eksik kalirsa rastgele tamamla
        if (distributed.length < mode.questionCount) {
          const remaining = questions.filter(q => !distributed.includes(q))
          const shuffled = [...remaining].sort(() => Math.random() - 0.5)
          distributed.push(...shuffled.slice(0, mode.questionCount - distributed.length))
        }
        distributed.sort(() => Math.random() - 0.5)
        quizStore.startQuiz(distributed.slice(0, mode.questionCount))
        elapsed.reset()
      } else {
        // Normal mod
        quizStore.startQuiz(questions.slice(0, mode.questionCount))
      }

      setScreen('game')

      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    } catch (err) {
      console.error('[QuizEngine] Soru yukleme hatasi:', err)
      // Fallback
      const fallback = DEMO_QUESTIONS.filter(q => q.game === game)
      quizStore.startQuiz(fallback.length > 0 ? fallback : DEMO_QUESTIONS)
      setScreen('game')
      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    }
  }, [game, mode, quizStore, timer, isDeneme, denemeConfig, elapsed, gameStore.selectedCategory, gameStore.selectedDifficulty])

  // Cevap ver
  const handleAnswer = useCallback((optionIndex: number) => {
    if (quizStore.state !== 'playing') return

    const question = quizStore.currentQuestion()
    if (!question) return

    if (isDeneme) {
      const isCorrect = optionIndex === question.content.answer
      const newStreak = isCorrect ? quizStore.streak + 1 : 0
      const xpResult = calculateXP(question.difficulty, 0, newStreak)
      quizStore.answerQuestion(optionIndex, isCorrect, 0, xpResult)

      if (isCorrect) {
        setShowBurst(true)
        setTimeout(() => setShowBurst(false), 1200)
      }
    } else {
      timer.stop()
      const timeTaken = mode.timePerQuestion - timer.seconds
      const isCorrect = optionIndex === question.content.answer
      const newStreak = isCorrect ? quizStore.streak + 1 : 0
      const xpResult = calculateXP(question.difficulty, timer.seconds, newStreak)
      quizStore.answerQuestion(optionIndex, isCorrect, timeTaken, xpResult)

      if (isCorrect) {
        setShowBurst(true)
        setShowXPPopup(true)
        setTimeout(() => { setShowBurst(false); setShowXPPopup(false) }, 1600)
      }
    }
  }, [quizStore, timer, mode.timePerQuestion, isDeneme])

  // Sonraki soru
  const handleNext = useCallback(() => {
    setShowComments(false)
    setShowReportModal(false)
    if (quizStore.isLastQuestion()) {
      quizStore.completeQuiz()
      setScreen('result')
    } else {
      quizStore.nextQuestion()
      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    }
  }, [quizStore, timer, mode.timePerQuestion, isDeneme])

  // Yeniden baslat
  const handleRestart = useCallback(() => {
    quizStore.resetQuiz()
    sessionSavedRef.current = false
    setScreen('lobby')
  }, [quizStore])

  // Secenek durumunu hesapla
  const getOptionState = (index: number): OptionState => {
    const question = quizStore.currentQuestion()
    if (quizStore.state !== 'answered' || !question) return 'idle'

    const lastAnswer = quizStore.answers[quizStore.answers.length - 1]
    if (!lastAnswer) return 'idle'

    if (index === question.content.answer) return 'correct'
    if (index === lastAnswer.selectedOption) return 'wrong'
    return 'dim'
  }

  // --- LOBBY ---
  if (screen === 'lobby') {
    return (
      <Lobby
        game={game}
        selectedMode={gameStore.selectedMode}
        onSelectMode={(m) => gameStore.setMode(m.id)}
        onStart={handleStart}
        userXP={userXP}
        userStreak={userStreak}
      />
    )
  }

  // --- LOADING ---
  if (screen === 'loading') {
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
  if (screen === 'result') {
    if (isDeneme && denemeConfig) {
      return (
        <DenemeResult
          gameName={gameDef.name}
          totalTime={denemeConfig.totalTime}
          elapsedTime={elapsed.getElapsed()}
          onRestart={handleRestart}
          onExit={handleRestart}
        />
      )
    }
    return <ResultScreen onRestart={handleRestart} onExit={handleRestart} />
  }

  // --- GAME ---
  const question = quizStore.currentQuestion()
  if (!question) return null

  const lastAnswer = quizStore.answers[quizStore.answers.length - 1]
  const level = getLevelFromXP(quizStore.xpEarned)

  // Sidebar data (mock — ileride gercek veriyle degistirilecek)
  const sidebarPlayers = [
    { name: 'Zeynep', avatar: '🦊', xp: '1.820' },
    { name: 'Emre', avatar: '🐉', xp: '1.720' },
    { name: 'Oyuncu', avatar: '🦉', xp: '1.640' },
    { name: 'Selin', avatar: '🌟', xp: '1.410' },
    { name: 'Kaan', avatar: '⚔️', xp: '1.190' },
  ]

  const sidebarQuests = [
    { label: '10 soru coz', done: quizStore.currentIndex + 1, total: 10, color: 'var(--focus)' },
    { label: '3 seri yap', done: Math.min(quizStore.maxStreak, 3), total: 3, color: 'var(--reward)' },
    { label: `${gameDef.name} oyna`, done: 1, total: 1, color: 'var(--growth)' },
  ]

  const sidebarTopics = gameDef.categories.map((cat, i) => ({
    label: cat.charAt(0).toUpperCase() + cat.slice(1),
    percentage: [78, 54, 91, 31][i % 4],
  }))

  return (
    <div className="mx-auto max-w-[940px] p-3 md:p-4 lg:p-5 xl:max-w-[1100px] xl:p-6 2xl:max-w-[1280px] 2xl:p-8">
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-[1fr_190px] xl:grid-cols-[1fr_220px] xl:gap-5 2xl:grid-cols-[1fr_260px]">
      {/* Sol sutun */}
      <div className="flex flex-col gap-3 md:gap-4 xl:gap-5">
        {/* Deneme timer */}
        {isDeneme && denemeConfig && (
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
              totalTime={denemeConfig.totalTime}
              onTimeUp={handleDenemeTimeUp}
              isPaused={screen !== 'game'}
            />
          </div>
        )}

        {/* Profil seridi (normal mod) */}
        {!isDeneme && (
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
              {showBurst && <BurstParticles />}
            </QuestionCard>
          </div>

          {/* Per-question timer kutusu */}
          {!isDeneme && mode.timePerQuestion > 0 && (
            <div className="flex flex-col items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-2.5 py-3">
              <Timer seconds={timer.seconds} total={mode.timePerQuestion} />
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
              state={getOptionState(idx)}
              onClick={() => handleAnswer(idx)}
              delay={idx * 55}
            />
          ))}
        </div>

        {/* XP popup */}
        {!isDeneme && showXPPopup && quizStore.lastXPResult && (
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
        {!isDeneme && quizStore.state === 'answered' && lastAnswer && (
          <>
            <ExplanationPanel
              question={question}
              selectedOption={lastAnswer.selectedOption}
              isCorrect={lastAnswer.isCorrect}
              isLastQuestion={quizStore.isLastQuestion()}
              onNext={handleNext}
              onOpenComments={() => setShowComments(!showComments)}
              onOpenReport={() => setShowReportModal(true)}
            />

            {showComments && (
              <CommentSection questionId={question.id} isLoggedIn={!!user} />
            )}

            <ErrorReportModal
              questionId={question.id}
              isOpen={showReportModal}
              onClose={() => setShowReportModal(false)}
            />
          </>
        )}
      </div>

      {/* Sag sidebar */}
      {!isDeneme && (
        <div className="hidden flex-col gap-3 lg:flex">
          <MiniLeaderboard players={sidebarPlayers} myRank={3} />
          <DailyQuests quests={sidebarQuests} />
          <TopicsPanel topics={sidebarTopics} />
        </div>
      )}
      </div>
    </div>
  )
}

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { useGameStore } from '@/stores/game-store'
import { useChatStore } from '@/stores/chat-store'
import { useTimer } from '@/lib/hooks/use-timer'
import { calculateXP } from '@/lib/utils/xp'
import { getModeById, DENEME_CONFIGS, type DenemeConfig } from '@/lib/constants/modes'
import type { GameSlug } from '@/lib/constants/games'
import { fetchQuizQuestions, fetchPreviewQuestion } from '@/lib/supabase/questions'
import { getAdaptiveDifficulty } from '@/lib/supabase/adaptive-difficulty'
import { useElapsedTime } from '@/components/game/deneme-timer'
import { playSound } from '@/lib/utils/sounds'
import type { PublicQuestion } from '@/lib/utils/question-public'
import type { OptionState } from '@/components/game/option-button'
import { shufflePublicOptionsWithMap } from '@/lib/utils/question'
import { gradeQuestion } from '@/lib/questions/grade-question'
import { toast } from '@/stores/toast-store'

// ---------- Hook return tipi ----------

export interface UseQuizGameReturn {
  // Screen
  screen: 'lobby' | 'loading' | 'game' | 'result'
  /** Soru yükleme hatası (null = sorun yok) — lobby'de gösterilir */
  loadError: string | null
  /** Giriş yapmadan önizleme: 1 gerçek soru gösterildi, result'ta kayıt CTA */
  isGuestMode: boolean

  // Mode bilgileri
  mode: ReturnType<typeof getModeById>
  isDeneme: boolean
  denemeConfig: DenemeConfig | null
  elapsed: ReturnType<typeof useElapsedTime>

  // Timer
  timer: ReturnType<typeof useTimer>

  // Visual effects
  showBurst: boolean
  showXPPopup: boolean
  showLifeLost: boolean
  showComments: boolean
  showReportModal: boolean
  setShowComments: (v: boolean) => void
  setShowReportModal: (v: boolean) => void
  /** Bilge Chan companion 'yardim' balonu acik/kapali — sayaci duraklatir */
  setHelpPaused: (v: boolean) => void

  // Aksiyonlar
  handleStart: () => Promise<void>
  /** "Bugunun 15'i" plan sorularini dogrudan baslatir -- fetch/slice yok. */
  handleStartPlanned: (questions: PublicQuestion[]) => void
  /** Sunucuda hazırlanmış kişisel soru setini gerçek deneme semantiğiyle başlatır. */
  handleStartPreparedDeneme: (questions: PublicQuestion[]) => void
  handleAnswer: (optionIndex: number) => void
  handleNext: () => void
  handleRestart: () => void
  handleDenemeTimeUp: () => void
  getOptionState: (index: number) => OptionState
}

/**
 * Quiz oyun mantigi hook'u.
 * Screen yonetimi, soru yukleme, cevaplama, zamanlayici, visual efektleri
 * tek bir hook'ta toplar.
 */
export function useQuizGame(game: GameSlug, userId?: string | null): UseQuizGameReturn {
  const quizStore = useQuizStore()
  const gameStore = useGameStore()

  const [screen, setScreen] = useState<'lobby' | 'loading' | 'game' | 'result'>('lobby')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isGuestMode, setIsGuestMode] = useState(false)
  const [showBurst, setShowBurst] = useState(false)
  const [showXPPopup, setShowXPPopup] = useState(false)
  const [showLifeLost, setShowLifeLost] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  const mode = getModeById(gameStore.selectedMode)
  const isDeneme = mode.isDeneme === true
  const denemeConfig = isDeneme ? DENEME_CONFIGS[game] : null
  const elapsed = useElapsedTime()

  // Ekran->kanonik seçenek haritası (questionId -> map[ekranIdx]=kanonikIdx).
  const shuffleMapRef = useRef<Map<string, number[]>>(new Map())
  const gradingRef = useRef(false)
  const gradeRequestRef = useRef<AbortController | null>(null)
  const questionStartedAtRef = useRef(0)

  useEffect(() => () => gradeRequestRef.current?.abort(), [])

  // --- Timer ---

  const handleTimeUp = useCallback(() => {
    const question = quizStore.currentQuestion()
    if (!question || quizStore.state !== 'playing' || gradingRef.current) return

    gradingRef.current = true
    const controller = new AbortController()
    gradeRequestRef.current = controller
    void gradeQuestion(question.id, -1, controller.signal)
      .then((grade) => {
        const current = useQuizStore.getState()
        if (controller.signal.aborted || current.state !== 'playing' || current.currentQuestion()?.id !== question.id) return
        const shuffleMap = shuffleMapRef.current.get(question.id)
        const correctOption = shuffleMap ? shuffleMap.indexOf(grade.correctOption) : grade.correctOption
        if (correctOption < 0) throw new Error('invalid_grade_mapping')
        const xpResult = calculateXP(question.difficulty, 0, current.streak)
        current.answerQuestion(-1, false, mode.timePerQuestion, xpResult, -1, correctOption, grade.solution)
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error('[QuizGame] Süre sonu notlandırma hatası:', error)
          toast.error('Cevap doğrulanamadı', 'Lütfen bağlantını kontrol edip tekrar dene.')
        }
      })
      .finally(() => {
        if (gradeRequestRef.current === controller) gradeRequestRef.current = null
        gradingRef.current = false
      })
  }, [quizStore, mode.timePerQuestion])

  const timer = useTimer({
    initialTime: mode.timePerQuestion,
    onTimeUp: handleTimeUp,
    autoStart: false,
  })

  // --- Yardim acikken per-soru sayacini duraklat (Ensar 06-16) ---
  // "Sor" sohbeti (chat-store) VEYA Bilge Chan companion 'yardim' balonu acikken
  // kullanici aciklamayi okuyabilsin diye sayac durur; kapaninca kaldigi yerden
  // devam eder. Yalniz klasik (per-soru sureli) modda; deneme genel suresi ayri.
  const chatOpen = useChatStore((s) => s.isOpen)
  const [helpPaused, setHelpPaused] = useState(false)
  const helpOpen = chatOpen || helpPaused
  const helpWasPausedRef = useRef(false)

  useEffect(() => {
    if (isDeneme || mode.timePerQuestion <= 0 || quizStore.state !== 'playing') return
    if (helpOpen) {
      timer.pause()
      helpWasPausedRef.current = true
    } else if (helpWasPausedRef.current) {
      timer.start()
      helpWasPausedRef.current = false
    }
  }, [helpOpen, isDeneme, mode.timePerQuestion, quizStore.state, timer])
  // Companion-yardim durumu soru degisiminde handleNext/handleRestart'ta sifirlanir
  // (effect yerine handler — gereksiz cascading render onler).

  // --- Deneme: sure dolunca tum sinavi bitir ---

  const handleDenemeTimeUp = useCallback(() => {
    quizStore.completeQuiz()
    setScreen('result')
  }, [quizStore])

  // --- Can bitti: oyunu bitir ---

  useEffect(() => {
    if (quizStore.state === 'completed' && screen === 'game') {
      setScreen('result')
    }
  }, [quizStore.state, screen])

  // --- Deneme: cevap sonrasi MANUEL ilerleme ---
  // Otomatik ilerleme (1200ms) KALDIRILDI. Kullanıcı açıklamayı/yanlışını okuyup
  // ExplanationPanel'deki "Sonraki Soru" butonuyla (handleNext) kendi geçer —
  // gerçek deneme/test gibi. Genel deneme süresi akmaya devam eder (Ensar 06-16).

  // --- Sorulari yukle ve quiz'i baslat ---

  const handleStart = useCallback(async () => {
    setScreen('loading')
    setLoadError(null)
    setIsGuestMode(false)

    // ── Misafir önizleme: giriş yapmadan 1 gerçek soru ──
    if (!userId) {
      const previewQ = await fetchPreviewQuestion(game, {
        category: gameStore.selectedCategory,
        difficulty: gameStore.selectedDifficulty,
        examRef: gameStore.selectedExamRef,
      })
      if (!previewQ) {
        setLoadError('Soru yüklenemedi. Lütfen giriş yapın veya internet bağlantınızı kontrol edin.')
        setScreen('lobby')
        return
      }
      const previewShuffled = shufflePublicOptionsWithMap(previewQ.content)
      shuffleMapRef.current.set(previewQ.id, previewShuffled.map)
      const withShuffled = { ...previewQ, content: previewShuffled.content }
      quizStore.startQuiz([withShuffled], mode.lives)
      setIsGuestMode(true)
      questionStartedAtRef.current = Date.now()
      setScreen('game')
      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
      return
    }

    try {
      // Adaptive difficulty: kullanici zorluk secmediyse ve giris yaptiysa,
      // basari oranina gore otomatik zorluk belirle
      let difficulty = gameStore.selectedDifficulty
      if (!difficulty && userId && !isDeneme) {
        try {
          const suggested = await getAdaptiveDifficulty(game, gameStore.selectedCategory)
          if (suggested) difficulty = suggested
        } catch {
          // Adaptive difficulty alinamazsa varsayilan devam eder
        }
      }

      let questions = await fetchQuizQuestions({
        game,
        limit: isDeneme ? mode.questionCount * 2 : mode.questionCount * 3,
        category: gameStore.selectedCategory,
        difficulty,
        // Deneme'de spaced repetition kapatilir; normal modda server-side
        // auth.uid() ile review questions otomatik gelir (Madde 9 #6).
        includeReview: !isDeneme,
        examRef: gameStore.selectedExamRef,
      })

      // Soru bulunamadıysa lobby'e geri dön — demo gösterme
      if (questions.length === 0) {
        console.warn('[QuizGame] Soru bulunamadı — seçili filtrelerle soru yok')
        setLoadError('Bu filtrelerle soru bulunamadı. Farklı bir konu veya zorluk seçin.')
        setScreen('lobby')
        return
      }

      // Sik sirasini karistir — cevap dagılımı dengesizligini onle.
      // Ekran->kanonik haritasi saklanir: server /api/sessions KANONIK index'le
      // notlar; secim gonderilmeden once geri cevrilir (disc#1296, duello paterni).
      shuffleMapRef.current.clear()
      questions = questions.map(q => {
        const shuffled = shufflePublicOptionsWithMap(q.content)
        shuffleMapRef.current.set(q.id, shuffled.map)
        return { ...q, content: shuffled.content }
      })

      if (isDeneme && denemeConfig) {
        // Deneme: kategori dagilimina gore sorulari sec
        const distributed: PublicQuestion[] = []
        for (const [cat, count] of Object.entries(denemeConfig.questionDistribution)) {
          const catQuestions = questions.filter(q => q.category === cat)
          const shuffled = [...catQuestions].sort(() => Math.random() - 0.5)
          distributed.push(...shuffled.slice(0, count))
        }
        if (distributed.length < mode.questionCount) {
          const remaining = questions.filter(q => !distributed.includes(q))
          const shuffled = [...remaining].sort(() => Math.random() - 0.5)
          distributed.push(...shuffled.slice(0, mode.questionCount - distributed.length))
        }
        distributed.sort(() => Math.random() - 0.5)
        quizStore.startQuiz(distributed.slice(0, mode.questionCount))
        elapsed.reset()
      } else {
        quizStore.startQuiz(questions.slice(0, mode.questionCount), mode.lives)
      }

      questionStartedAtRef.current = Date.now()
      setScreen('game')

      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    } catch (err) {
      console.error('[QuizGame] Soru yükleme hatası:', err)
      setLoadError('Sorular yüklenirken bir hata oluştu. İnternet bağlantınızı kontrol edin.')
      setScreen('lobby')
    }
  }, [game, mode, quizStore, timer, isDeneme, denemeConfig, elapsed, gameStore.selectedCategory, gameStore.selectedDifficulty, gameStore.selectedExamRef, userId])

  // --- "Bugunun 15'i" plani dogrudan baslat ---
  // handleStart'in basari-dalinin aynasi: fetch/slice yok (sorular caginan
  // tarafindan zaten hazirlanmis gelir, bkz. use-today-plan.ts), lives sabit 0
  // (plan modu daima cansiz/suresiz -- gameStore.setMode('practice') caginan
  // tarafindan ayrica cagrilir, ama `mode`/`isDeneme` degiskenlerine BILEREK
  // bagli DEGIL: setMode + handleStartPlanned ayni event-handler icinde ard
  // arda cagrildiginda bu hook'un `mode` closure'i bir onceki render'in eski
  // degerini tasir -- zustand set() senkron olsa da React yeniden render
  // ETMEDEN bu callback'in closure'i guncellenmez).
  const handleStartPlanned = useCallback((questions: PublicQuestion[]) => {
    if (questions.length === 0) return

    shuffleMapRef.current.clear()
    const shuffledQuestions = questions.map(q => {
      const s = shufflePublicOptionsWithMap(q.content)
      shuffleMapRef.current.set(q.id, s.map)
      return { ...q, content: s.content }
    })

    quizStore.startQuiz(shuffledQuestions, 0)
    setIsGuestMode(false)
    setLoadError(null)
    // Timer BASLATILMAZ (plan suresiz) ama SIFIRLANIR: classic/blitz lobisinden
    // gelindiginde useTimer onceki modun saniyesini (30/15) tutar; sifirlanmazsa
    // handleAnswer'da timeTaken = 0 - timer.seconds NEGATIF olur, /api/sessions
    // reddeder ve plan XP/ilerleme kaydedilmeden "tamamlandi" gorunur (Codex P1).
    timer.reset(0)
    questionStartedAtRef.current = Date.now()
    setScreen('game')
  }, [quizStore, timer])

  // --- Hazır Akıllı Deneme setini doğrudan başlat ---
  // `setMode('deneme')` ile aynı event içinde çağrılabileceği için bu callback
  // render anındaki `mode/isDeneme` closure'ına dayanmaz. Sunucu zaten 40 soruluk
  // kişisel seti seçmiştir; burada yalnız seçenekleri karıştırıp deneme sayaçlarını
  // temizleriz.
  const handleStartPreparedDeneme = useCallback((questions: PublicQuestion[]) => {
    if (questions.length === 0) return

    shuffleMapRef.current.clear()
    const shuffledQuestions = questions.map((question) => {
      const shuffled = shufflePublicOptionsWithMap(question.content)
      shuffleMapRef.current.set(question.id, shuffled.map)
      return { ...question, content: shuffled.content }
    })

    quizStore.startQuiz(shuffledQuestions)
    elapsed.reset()
    timer.reset(0)
    setIsGuestMode(false)
    setLoadError(null)
    questionStartedAtRef.current = Date.now()
    setScreen('game')
  }, [elapsed, quizStore, timer])

  // --- Cevap ver ---

  const handleAnswer = useCallback((optionIndex: number) => {
    if (quizStore.state !== 'playing' || gradingRef.current) return

    const question = quizStore.currentQuestion()
    if (!question) return

    // Ekran-index'ini kanonik DB-index'ine cevir — server bununla notlar (disc#1296).
    const shuffleMap = shuffleMapRef.current.get(question.id)
    const canonicalIndex = optionIndex >= 0 && shuffleMap ? shuffleMap[optionIndex] : optionIndex
    if (!Number.isInteger(canonicalIndex)) return

    const isTimedMode = !isDeneme && mode.timePerQuestion > 0
    const timeRemaining = isTimedMode ? timer.seconds : 0
    const timeTaken = isTimedMode
      ? Math.max(0, mode.timePerQuestion - timer.seconds)
      : questionStartedAtRef.current > 0
        ? Math.min(300, Math.max(0, (Date.now() - questionStartedAtRef.current) / 1000))
        : 0
    if (isTimedMode) timer.stop()

    gradingRef.current = true
    const controller = new AbortController()
    gradeRequestRef.current = controller

    void gradeQuestion(question.id, canonicalIndex, controller.signal)
      .then((grade) => {
        const current = useQuizStore.getState()
        if (controller.signal.aborted || current.state !== 'playing' || current.currentQuestion()?.id !== question.id) return

        const correctOption = shuffleMap ? shuffleMap.indexOf(grade.correctOption) : grade.correctOption
        if (correctOption < 0) throw new Error('invalid_grade_mapping')

        const newStreak = grade.isCorrect ? current.streak + 1 : 0
        const xpResult = calculateXP(question.difficulty, timeRemaining, newStreak)
        current.answerQuestion(
          optionIndex,
          grade.isCorrect,
          timeTaken,
          xpResult,
          canonicalIndex,
          correctOption,
          grade.solution,
        )

        if (grade.isCorrect) {
          playSound(newStreak >= 3 ? 'streak' : 'correct')
          setShowBurst(true)
          if (!isDeneme) setShowXPPopup(true)
          setTimeout(() => { setShowBurst(false); setShowXPPopup(false) }, isDeneme ? 1200 : 1600)
        } else {
          const livesNow = current.livesEnabled ? current.lives - 1 : -1
          playSound(livesNow === 0 ? 'game_over' : current.livesEnabled ? 'life_lost' : 'wrong')
          if (current.livesEnabled) {
            setShowLifeLost(true)
            setTimeout(() => setShowLifeLost(false), 700)
          }
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('[QuizGame] Cevap notlandırma hatası:', error)
        if (isTimedMode && useQuizStore.getState().state === 'playing') timer.start()
        toast.error('Cevap doğrulanamadı', 'Lütfen bağlantını kontrol edip tekrar dene.')
      })
      .finally(() => {
        if (gradeRequestRef.current === controller) gradeRequestRef.current = null
        gradingRef.current = false
      })
  }, [quizStore, timer, mode.timePerQuestion, isDeneme])

  // --- Sonraki soru ---

  const handleNext = useCallback(() => {
    setShowComments(false)
    setShowReportModal(false)
    setHelpPaused(false) // yeni soruda yardım-duraklatma sıfırlanır
    helpWasPausedRef.current = false
    // Son soru VEYA canlar bitti (livesExhausted: cozum gosterildi, kullanici "devam"
    // dedi -> simdi game-over). Aksi halde son canda aciklama atlanip cikiyordu.
    if (quizStore.isLastQuestion() || quizStore.livesExhausted) {
      quizStore.completeQuiz()
      setScreen('result')
    } else {
      quizStore.nextQuestion()
      questionStartedAtRef.current = Date.now()
      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    }
  }, [quizStore, timer, mode.timePerQuestion, isDeneme])

  // --- Yeniden baslat ---

  const handleRestart = useCallback(() => {
    gradeRequestRef.current?.abort()
    gradeRequestRef.current = null
    gradingRef.current = false
    quizStore.resetQuiz()
    setIsGuestMode(false)
    setHelpPaused(false)
    helpWasPausedRef.current = false
    setScreen('lobby')
  }, [quizStore])

  // --- Secenek durumu ---

  const getOptionState = useCallback((index: number): OptionState => {
    const question = quizStore.currentQuestion()
    if (quizStore.state !== 'answered' || !question) return 'idle'

    const lastAnswer = quizStore.answers[quizStore.answers.length - 1]
    if (!lastAnswer) return 'idle'

    if (index === lastAnswer.correctOption) return 'correct'
    if (index === lastAnswer.selectedOption) return 'wrong'
    return 'dim'
  }, [quizStore])

  return {
    screen,
    loadError,
    isGuestMode,
    mode,
    isDeneme,
    denemeConfig: denemeConfig ?? null,
    elapsed,
    timer,
    showBurst,
    showXPPopup,
    showLifeLost,
    showComments,
    showReportModal,
    setShowComments,
    setShowReportModal,
    setHelpPaused,
    handleStart,
    handleStartPlanned,
    handleStartPreparedDeneme,
    handleAnswer,
    handleNext,
    handleRestart,
    handleDenemeTimeUp,
    getOptionState,
  }
}

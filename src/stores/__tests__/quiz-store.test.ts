import { describe, it, expect, beforeEach } from 'vitest'
import { useQuizStore } from '../quiz-store'
import type { Question } from '@/types/database'
import type { XPResult } from '@/lib/utils/xp'

// ─── Test verileri ───────────────────────────────────────

const mockQuestions: Question[] = [
  {
    id: 'q1', game: 'matematik', category: 'aritmetik', sub_category: null,
    difficulty: 2, content: { question: '2+2=?', options: ['3', '4', '5', '6'], answer: 1 },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'q2', game: 'matematik', category: 'aritmetik', sub_category: null,
    difficulty: 3, content: { question: '3*3=?', options: ['6', '9', '12', '15'], answer: 1 },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'q3', game: 'matematik', category: 'geometri', sub_category: null,
    difficulty: 1, content: { question: 'Ucgen kac kenar?', options: ['2', '3', '4', '5'], answer: 1 },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
]

const xpResult: XPResult = { base: 10, timeBonus: 5, streakBonus: 0, total: 15, hasBonus: true }
const xpResultStreak: XPResult = { base: 10, timeBonus: 5, streakBonus: 3, total: 18, hasBonus: true }

describe('quiz-store', () => {
  beforeEach(() => {
    useQuizStore.getState().resetQuiz()
  })

  // ─── Baslangic durumu ────────────────────────────────

  it('baslangic durumu idle olmali', () => {
    const s = useQuizStore.getState()
    expect(s.state).toBe('idle')
    expect(s.questions).toHaveLength(0)
    expect(s.currentIndex).toBe(0)
    expect(s.score).toBe(0)
    expect(s.streak).toBe(0)
    expect(s.xpEarned).toBe(0)
    expect(s.lives).toBe(0)
    expect(s.livesEnabled).toBe(false)
  })

  // ─── startQuiz ───────────────────────────────────────

  describe('startQuiz', () => {
    it('sorulari yukleyip playing durumuna gecmeli', () => {
      useQuizStore.getState().startQuiz(mockQuestions)
      const s = useQuizStore.getState()

      expect(s.state).toBe('playing')
      expect(s.questions).toHaveLength(3)
      expect(s.currentIndex).toBe(0)
      expect(s.score).toBe(0)
      expect(s.streak).toBe(0)
      expect(s.maxStreak).toBe(0)
      expect(s.xpEarned).toBe(0)
    })

    it('can sistemi ile baslatilabilmeli', () => {
      useQuizStore.getState().startQuiz(mockQuestions, 3)
      const s = useQuizStore.getState()

      expect(s.lives).toBe(3)
      expect(s.maxLives).toBe(3)
      expect(s.livesEnabled).toBe(true)
    })

    it('can olmadan baslatilinca livesEnabled false olmali', () => {
      useQuizStore.getState().startQuiz(mockQuestions)
      expect(useQuizStore.getState().livesEnabled).toBe(false)
      expect(useQuizStore.getState().lives).toBe(0)
    })

    it('onceki durumu sifirlamali', () => {
      // Once bir quiz oyna
      useQuizStore.getState().startQuiz(mockQuestions)
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      expect(useQuizStore.getState().score).toBe(1)

      // Yeni quiz baslatinca sifirlanmali
      useQuizStore.getState().startQuiz(mockQuestions)
      expect(useQuizStore.getState().score).toBe(0)
      expect(useQuizStore.getState().answers).toHaveLength(0)
    })
  })

  // ─── answerQuestion ──────────────────────────────────

  describe('answerQuestion', () => {
    beforeEach(() => {
      useQuizStore.getState().startQuiz(mockQuestions)
    })

    it('dogru cevap skoru ve streak artirmali', () => {
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      const s = useQuizStore.getState()

      expect(s.state).toBe('answered')
      expect(s.score).toBe(1)
      expect(s.streak).toBe(1)
      expect(s.xpEarned).toBe(15)
      expect(s.answers).toHaveLength(1)
      expect(s.answers[0].isCorrect).toBe(true)
      expect(s.answers[0].questionId).toBe('q1')
    })

    it('yanlis cevap streak sifirlamali ve XP vermemeli', () => {
      // Once dogru cevapla
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      expect(useQuizStore.getState().streak).toBe(1)

      // Sonra yanlis cevapla
      useQuizStore.getState().nextQuestion()
      useQuizStore.getState().answerQuestion(0, false, 8, xpResult)
      const s = useQuizStore.getState()

      expect(s.streak).toBe(0)
      expect(s.score).toBe(1) // sadece ilk dogru
      expect(s.xpEarned).toBe(15) // yanlis cevap XP vermez
    })

    it('maxStreak en yuksek streak degerini tutmali', () => {
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      useQuizStore.getState().nextQuestion()
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      expect(useQuizStore.getState().maxStreak).toBe(2)

      // Yanlis cevap — streak sifir ama maxStreak korunmali
      useQuizStore.getState().nextQuestion()
      useQuizStore.getState().answerQuestion(0, false, 8, xpResult)
      expect(useQuizStore.getState().streak).toBe(0)
      expect(useQuizStore.getState().maxStreak).toBe(2)
    })

    it('XP birikimli toplanmali', () => {
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult) // +15
      useQuizStore.getState().nextQuestion()
      useQuizStore.getState().answerQuestion(1, true, 3, xpResultStreak) // +18

      expect(useQuizStore.getState().xpEarned).toBe(33) // 15 + 18
    })

    it('cevap kaydi dogru yapilmali', () => {
      useQuizStore.getState().answerQuestion(2, false, 12, xpResult)
      const answer = useQuizStore.getState().answers[0]

      expect(answer.questionId).toBe('q1')
      expect(answer.selectedOption).toBe(2)
      expect(answer.isCorrect).toBe(false)
      expect(answer.timeTaken).toBe(12)
      expect(answer.xpEarned).toBe(0) // yanlis → 0 XP
    })

    it('olmayan soru icin islem yapmamali', () => {
      // Index'i sinir disina cikar
      useQuizStore.setState({ currentIndex: 99 })
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)

      expect(useQuizStore.getState().answers).toHaveLength(0)
    })
  })

  // ─── Can sistemi ─────────────────────────────────────

  describe('can sistemi', () => {
    beforeEach(() => {
      useQuizStore.getState().startQuiz(mockQuestions, 2) // 2 canla basla
    })

    it('yanlis cevap can azaltmali', () => {
      useQuizStore.getState().answerQuestion(0, false, 5, xpResult)
      expect(useQuizStore.getState().lives).toBe(1)
    })

    it('dogru cevap can azaltmamali', () => {
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      expect(useQuizStore.getState().lives).toBe(2)
    })

    it('can bitince completed olmali', () => {
      useQuizStore.getState().answerQuestion(0, false, 5, xpResult) // 2→1
      expect(useQuizStore.getState().state).toBe('answered')

      useQuizStore.getState().nextQuestion()
      useQuizStore.getState().answerQuestion(0, false, 5, xpResult) // 1→0
      expect(useQuizStore.getState().state).toBe('completed')
    })

    it('can sistemi kapaliyken yanlis cevap can azaltmamali', () => {
      useQuizStore.getState().startQuiz(mockQuestions) // cansiz
      useQuizStore.getState().answerQuestion(0, false, 5, xpResult)

      expect(useQuizStore.getState().lives).toBe(0)
      expect(useQuizStore.getState().state).toBe('answered') // completed degil
    })
  })

  // ─── nextQuestion ────────────────────────────────────

  describe('nextQuestion', () => {
    beforeEach(() => {
      useQuizStore.getState().startQuiz(mockQuestions)
    })

    it('sonraki soruya gecmeli', () => {
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      useQuizStore.getState().nextQuestion()

      expect(useQuizStore.getState().state).toBe('playing')
      expect(useQuizStore.getState().currentIndex).toBe(1)
      expect(useQuizStore.getState().lastXPResult).toBeNull()
    })

    it('son sorudan sonra completed olmali', () => {
      // 3 soruyu cevapla
      for (let i = 0; i < 2; i++) {
        useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
        useQuizStore.getState().nextQuestion()
      }
      // Son soru
      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      useQuizStore.getState().nextQuestion()

      expect(useQuizStore.getState().state).toBe('completed')
    })
  })

  // ─── Computed helpers ────────────────────────────────

  describe('computed helpers', () => {
    it('currentQuestion ilk soruyu dondurmeli', () => {
      useQuizStore.getState().startQuiz(mockQuestions)
      expect(useQuizStore.getState().currentQuestion()?.id).toBe('q1')
    })

    it('bos quiz icin currentQuestion null dondurmeli', () => {
      expect(useQuizStore.getState().currentQuestion()).toBeNull()
    })

    it('progress dogru yuzde hesaplamali', () => {
      useQuizStore.getState().startQuiz(mockQuestions) // 3 soru
      expect(useQuizStore.getState().progress()).toBeCloseTo(33.33, 1) // 1/3

      useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
      useQuizStore.getState().nextQuestion()
      expect(useQuizStore.getState().progress()).toBeCloseTo(66.67, 1) // 2/3
    })

    it('bos quiz icin progress 0 dondurmeli', () => {
      expect(useQuizStore.getState().progress()).toBe(0)
    })

    it('isLastQuestion dogru calismali', () => {
      useQuizStore.getState().startQuiz(mockQuestions)
      expect(useQuizStore.getState().isLastQuestion()).toBe(false)

      // Son soruya git
      useQuizStore.setState({ currentIndex: 2 })
      expect(useQuizStore.getState().isLastQuestion()).toBe(true)
    })
  })

  // ─── resetQuiz ───────────────────────────────────────

  it('resetQuiz tum durumu sifirlamali', () => {
    useQuizStore.getState().startQuiz(mockQuestions, 3)
    useQuizStore.getState().answerQuestion(1, true, 5, xpResult)
    useQuizStore.getState().resetQuiz()

    const s = useQuizStore.getState()
    expect(s.state).toBe('idle')
    expect(s.questions).toHaveLength(0)
    expect(s.score).toBe(0)
    expect(s.streak).toBe(0)
    expect(s.lives).toBe(0)
    expect(s.livesEnabled).toBe(false)
  })

  // ─── completeQuiz ────────────────────────────────────

  it('completeQuiz durumu completed yapmali', () => {
    useQuizStore.getState().startQuiz(mockQuestions)
    useQuizStore.getState().completeQuiz()
    expect(useQuizStore.getState().state).toBe('completed')
  })
})

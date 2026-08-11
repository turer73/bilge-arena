'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, LoaderCircle, Sparkles, Trophy, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionCard } from '@/components/game/question-card'
import { OptionButton, type OptionState } from '@/components/game/option-button'
import { useAuth } from '@/lib/hooks/use-auth'
import { gradeQuestion, type QuestionGradeResult } from '@/lib/questions/grade-question'
import { fetchPreviewQuestions } from '@/lib/supabase/questions'
import { shufflePublicOptionsWithMap } from '@/lib/utils/question'
import { renderRichText } from '@/lib/utils/rich-text'
import { playSound } from '@/lib/utils/sounds'
import { trackEvent } from '@/lib/utils/plausible'
import {
  ACTIVATION_EXPERIMENT,
  ACTIVATION_RESULT_STORAGE_KEY,
  getActivationVariant,
} from '@/lib/experiments/activation'
import type { PublicQuestion, PublicQuestionContent } from '@/lib/utils/question-public'

type ExamGoal = 'LGS' | 'TYT'

interface PreparedQuestion {
  question: PublicQuestion
  content: PublicQuestionContent
  optionMap: number[]
}

interface AnswerState extends QuestionGradeResult {
  selectedDisplayIndex: number
}

const GOALS: Array<{ value: ExamGoal; title: string; description: string }> = [
  { value: 'LGS', title: 'LGS', description: 'Ortaokul hedefim' },
  { value: 'TYT', title: 'TYT · AYT', description: 'Üniversite hedefim' },
]

const CONFETTI = [
  ['12%', '8%', '#FBBF24', '-13deg'],
  ['24%', '2%', '#3B82F6', '21deg'],
  ['39%', '9%', '#10B981', '8deg'],
  ['55%', '1%', '#A78BFA', '-24deg'],
  ['69%', '10%', '#FB7185', '17deg'],
  ['84%', '4%', '#22D3EE', '-7deg'],
] as const

function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden" aria-hidden="true">
      {CONFETTI.map(([left, top, color, rotate], index) => (
        <span
          key={left}
          className="absolute h-2.5 w-1.5 animate-[particle_900ms_ease-out_forwards] rounded-sm"
          style={{
            left,
            top,
            backgroundColor: color,
            rotate,
            animationDelay: `${index * 45}ms`,
          }}
        />
      ))}
    </div>
  )
}

function prepareQuestions(questions: PublicQuestion[]): PreparedQuestion[] {
  return questions.slice(0, 3).map((question) => {
    const shuffled = shufflePublicOptionsWithMap(question.content)
    return { question, content: shuffled.content, optionMap: shuffled.map }
  })
}

export function ActivationMicroQuiz() {
  const { user, signInWithGoogle } = useAuth()
  const [goal, setGoal] = useState<ExamGoal | null>(null)
  const [questions, setQuestions] = useState<PreparedQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<AnswerState[]>([])
  const [selectedDisplayIndex, setSelectedDisplayIndex] = useState<number | null>(null)
  const [gradeResult, setGradeResult] = useState<QuestionGradeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  const variant = getActivationVariant()
  const prepared = questions[currentIndex]
  const correctCount = answers.filter((answer) => answer.isCorrect).length
  const earnedDemoXp = correctCount * 50

  const displayedQuestion = useMemo(() => {
    if (!prepared) return null
    return { ...prepared.question, content: prepared.content }
  }, [prepared])

  const selectGoal = async (nextGoal: ExamGoal) => {
    setGoal(nextGoal)
    setLoading(true)
    setError(null)
    trackEvent('ActivationGoalSelected', {
      props: { experiment: ACTIVATION_EXPERIMENT, variant, exam: nextGoal },
    })

    const result = await fetchPreviewQuestions('turkce', { examRef: nextGoal, activation: true })
    const nextQuestions = prepareQuestions(result)
    setQuestions(nextQuestions)
    setLoading(false)

    if (nextQuestions.length === 0) {
      setError('Şu anda uygun soru getiremedik. Birazdan tekrar deneyebilirsin.')
      return
    }

    trackEvent('ActivationQuestionShown', {
      props: {
        experiment: ACTIVATION_EXPERIMENT,
        variant,
        exam: nextGoal,
        game: 'turkce',
        position: 1,
      },
    })
  }

  const submitAnswer = async (displayIndex: number) => {
    if (!prepared || grading || gradeResult) return
    const canonicalIndex = prepared.optionMap[displayIndex]
    if (canonicalIndex === undefined) return

    setSelectedDisplayIndex(displayIndex)
    setGrading(true)
    setError(null)

    try {
      const result = await gradeQuestion(prepared.question.id, canonicalIndex, null)
      setGradeResult(result)
      setAnswers((current) => [...current, { ...result, selectedDisplayIndex: displayIndex }])
      playSound(result.isCorrect ? 'correct' : 'wrong')
      trackEvent('ActivationAnswerSubmitted', {
        props: {
          experiment: ACTIVATION_EXPERIMENT,
          variant,
          exam: goal ?? 'unknown',
          game: 'turkce',
          position: currentIndex + 1,
          correct: result.isCorrect,
        },
      })
      if (result.solution) {
        trackEvent('ActivationExplanationViewed', {
          props: {
            experiment: ACTIVATION_EXPERIMENT,
            variant,
            exam: goal ?? 'unknown',
            position: currentIndex + 1,
          },
        })
      }
    } catch {
      setSelectedDisplayIndex(null)
      setError('Cevabın kontrol edilemedi. Lütfen yeniden dene.')
    } finally {
      setGrading(false)
    }
  }

  const continueSession = () => {
    if (!goal || !gradeResult) return
    const isLastQuestion = currentIndex >= questions.length - 1
    if (isLastQuestion) {
      setCompleted(true)
      const finalCorrectCount = correctCount
      try {
        localStorage.setItem(ACTIVATION_RESULT_STORAGE_KEY, JSON.stringify({
          exam: goal,
          correct: finalCorrectCount,
          total: answers.length,
          completedAt: new Date().toISOString(),
        }))
      } catch {}
      trackEvent('ActivationMicroSessionCompleted', {
        props: {
          experiment: ACTIVATION_EXPERIMENT,
          variant,
          exam: goal,
          correct: finalCorrectCount,
          total: answers.length,
        },
      })
      playSound('level_up')
      return
    }

    const nextIndex = currentIndex + 1
    setCurrentIndex(nextIndex)
    setSelectedDisplayIndex(null)
    setGradeResult(null)
    setError(null)
    trackEvent('ActivationQuestionShown', {
      props: {
        experiment: ACTIVATION_EXPERIMENT,
        variant,
        exam: goal,
        game: 'turkce',
        position: nextIndex + 1,
      },
    })
  }

  const startSaving = async () => {
    trackEvent('ActivationSaveStarted', {
      props: { experiment: ACTIVATION_EXPERIMENT, variant, exam: goal ?? 'unknown' },
    })
    if (user) {
      window.location.assign('/arena/turkce')
      return
    }
    await signInWithGoogle('/arena/turkce')
  }

  const optionState = (displayIndex: number): OptionState => {
    if (!prepared) return 'dim'
    if (grading) return displayIndex === selectedDisplayIndex ? 'selected' : 'dim'
    if (!gradeResult) return 'idle'
    const canonicalIndex = prepared.optionMap[displayIndex]
    if (canonicalIndex === gradeResult.correctOption) return 'correct'
    if (displayIndex === selectedDisplayIndex) return 'wrong'
    return 'dim'
  }

  if (completed) {
    return (
      <div className="relative w-full overflow-hidden rounded-3xl border border-[var(--focus-border)] bg-[color-mix(in_srgb,var(--card-bg)_94%,transparent)] p-5 text-center shadow-2xl backdrop-blur-xl md:p-7">
        <ConfettiBurst />
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--reward-bg)] text-[var(--reward-text)]">
          <Trophy size={34} aria-hidden="true" />
        </div>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--focus-text)]">
          İlk tur tamamlandı
        </p>
        <h2 className="mt-2 font-display text-3xl font-black text-[var(--text)]">
          {correctCount}/{answers.length} doğru
        </h2>
        <div className="mx-auto mt-4 max-w-xs rounded-2xl border border-[var(--reward-border)] bg-[var(--reward-bg)] px-4 py-3">
          <div className="flex items-center justify-center gap-2 text-xl font-black text-[var(--reward-text)]">
            <Zap size={20} aria-hidden="true" /> +{earnedDemoXp} XP
          </div>
          <p className="mt-1 text-xs text-[var(--text-sub)]">
            Google ile giriş yaptığında hesabına tek seferlik eklenecek.
          </p>
        </div>
        <Button type="button" size="lg" className="mt-5 min-h-12 w-full" onClick={startSaving}>
          {user ? 'Türkçe arenasında devam et' : 'Google ile ücretsiz devam et'}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
          {user
            ? 'Sonraki turların XP ve seri ilerlemesine eklenir.'
            : 'Bu turun XP’si kaydolur; sonraki turların da seri ilerlemene eklenir.'}
        </p>
      </div>
    )
  }

  if (!goal || loading || error && questions.length === 0) {
    return (
      <div className="w-full rounded-3xl border border-[var(--focus-border)] bg-[color-mix(in_srgb,var(--card-bg)_94%,transparent)] p-5 shadow-2xl backdrop-blur-xl md:p-7">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--focus-text)]">
          <Sparkles size={18} aria-hidden="true" /> Üye olmadan hemen dene
        </div>
        <h2 className="mt-3 font-display text-2xl font-black leading-tight text-[var(--text)] md:text-3xl">
          Hedefin hangisi?
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
          Tek seçim, ardından 3 kısa Türkçe sorusu. Yaklaşık 2 dakika.
        </p>

        {loading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-[var(--text-sub)]" role="status">
            <LoaderCircle className="animate-spin" size={20} aria-hidden="true" /> İlk sorun hazırlanıyor…
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {GOALS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-label={`${item.title}: ${item.description}`}
                onClick={() => selectGoal(item.value)}
                className="min-h-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--focus)] hover:bg-[var(--focus-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              >
                <span className="block font-display text-xl font-black text-[var(--text)]">{item.title}</span>
                <span className="mt-1 block text-sm text-[var(--text-sub)]">{item.description}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-4 text-sm text-[var(--urgency-text)]" role="alert">{error}</p>}
        <p className="mt-5 text-xs leading-5 text-[var(--text-muted)]">
          Kayıt yok · Kart bilgisi yok · Sonucu görünce karar ver
        </p>
      </div>
    )
  }

  if (!displayedQuestion || !prepared) return null

  const correctDisplayIndex = gradeResult
    ? prepared.optionMap.indexOf(gradeResult.correctOption)
    : -1

  return (
    <div className="relative w-full rounded-3xl border border-[var(--focus-border)] bg-[color-mix(in_srgb,var(--card-bg)_96%,transparent)] p-3 shadow-2xl backdrop-blur-xl md:p-4">
      {gradeResult?.isCorrect && <ConfettiBurst />}
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--focus-text)]">Hızlı başlangıç</p>
          <p className="mt-1 text-xs text-[var(--text-sub)]">{goal === 'LGS' ? 'LGS' : 'TYT · AYT'} · Türkçe</p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-sub)]">
          {currentIndex + 1}/{questions.length}
        </span>
      </div>

      <QuestionCard question={displayedQuestion} currentIndex={currentIndex} totalQuestions={questions.length} />
      <div className="mt-3 grid gap-2" aria-busy={grading}>
        {prepared.content.options.map((option, index) => (
          <OptionButton
            key={`${prepared.question.id}-${index}`}
            index={index}
            text={option}
            state={optionState(index)}
            onClick={() => submitAnswer(index)}
            delay={index * 35}
          />
        ))}
      </div>

      {gradeResult && (
        <div
          className={`mt-3 rounded-2xl border p-4 ${gradeResult.isCorrect
            ? 'border-[var(--growth)] bg-[color-mix(in_srgb,var(--growth)_12%,var(--card-bg))]'
            : 'border-[var(--reward-border)] bg-[var(--reward-bg)]'}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 font-black text-[var(--text)]">
            {gradeResult.isCorrect ? (
              <><CheckCircle2 size={20} className="text-[var(--growth-text)]" aria-hidden="true" /> Harika! +50 XP</>
            ) : (
              <>Birlikte öğreniyoruz. Doğru cevap: {correctDisplayIndex >= 0 ? String.fromCharCode(65 + correctDisplayIndex) : ''}</>
            )}
          </div>
          {gradeResult.solution && (
            <div className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
              <span className="font-bold text-[var(--text)]">Kısa açıklama: </span>
              {renderRichText(gradeResult.solution)}
            </div>
          )}
          <Button type="button" size="md" className="mt-3 min-h-11 w-full" onClick={continueSession}>
            {currentIndex >= questions.length - 1 ? 'Sonucumu gör' : 'Sıradaki soru'}
            <ArrowRight size={17} aria-hidden="true" />
          </Button>
        </div>
      )}

      {error && <p className="mt-3 px-1 text-sm text-[var(--urgency-text)]" role="alert">{error}</p>}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, CircleCheckBig, CircleX, Clock3, Lightbulb, MessagesSquare, ScrollText, X } from 'lucide-react'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { getOptionLetter } from '@/lib/utils/question'
import { renderRichText, stripRichText } from '@/lib/utils/rich-text'
import { LikeButton } from '@/components/social/like-button'
import { TopicExplanationButton } from '@/components/bilge-tahta/topic-explanation-button'
import { AcademyDialog } from '@/components/academy/academy-dialog'

interface ExplanationPanelProps {
  question: PublicQuestion
  selectedOption: number
  isCorrect: boolean
  correctOption: number
  solution: string | null
  isLastQuestion: boolean
  onNext: () => void
  onOpenComments?: () => void
}

export function ExplanationPanel({
  question,
  selectedOption,
  isCorrect,
  correctOption,
  solution,
  isLastQuestion,
  onNext,
  onOpenComments,
}: ExplanationPanelProps) {
  const [solutionOpen, setSolutionOpen] = useState(false)
  const correctAnswer = correctOption
  const correctText = correctAnswer >= 0 ? question.content.options[correctAnswer] : null
  const selectedText = selectedOption >= 0 ? question.content.options[selectedOption] : null

  // Panel soru kartinin USTUNDE render olur; alt siklara tiklayan kullanicinin
  // viewport'u asagida kalabilir — mount'ta paneli gorunur yap (jsdom guard'li)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const topic = question.subcategory || question.category
  const topicContext = (() => {
    const opts = question.content.options
      .map((o, i) => `${'ABCDE'[i]}) ${o}`)
      .join('\n')
    const qText = stripRichText(question.content.question || question.content.sentence)
    // Öncül bloğu (passage) varsa soru metninin önüne ekle — asistan ifadeleri görsün (<u> AI'ya gitmesin)
    const body = question.content.passage ? `${stripRichText(question.content.passage)}\n\n${qText}` : qText
    const answerContext = correctText
      ? `${getOptionLetter(correctAnswer)}) ${correctText}`
      : 'Sunucudan alınamadı'
    return `[${question.game.toUpperCase()} - ${question.category}${question.subcategory ? ' / ' + question.subcategory : ''}]\n\nSoru: ${body}\n\n${opts}\n\nDoğru cevap: ${answerContext}${solution ? '\nÇözüm: ' + solution : ''}`
  })()

  const ResultIcon = isCorrect ? CircleCheckBig : correctText ? CircleX : Clock3
  const resultText = isCorrect
    ? 'Doğru! Mükemmel'
    : correctText
      ? `Yanlış. Doğru cevap: ${getOptionLetter(correctAnswer)}) ${stripRichText(correctText)}`
      : 'Süre doldu. Doğru cevap şu anda alınamadı.'

  return (
    <>
    <div
      ref={rootRef}
      data-quiz-feedback={isCorrect ? 'correct' : 'wrong'}
      className={`animate-fadeUp rounded-[22px] border-2 p-4 ${
        isCorrect
          ? 'border-[var(--app-success-border)] bg-[var(--app-success-tint)] shadow-[0_5px_0_var(--app-success-border)]'
          : 'border-[var(--app-danger-border)] bg-[var(--app-danger-tint)] shadow-[0_5px_0_var(--app-danger-border)]'
      }`}
    >
      {/* Sonuc mesaji */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`mb-2 flex items-start gap-2 text-base font-bold leading-6 ${
          isCorrect ? 'text-[var(--app-success-ink)]' : 'text-[var(--app-danger-ink)]'
        }`}
      >
        <ResultIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{resultText}</span>
      </div>

      {/* Kisa ozet kartta kalir; tam cozum istege bagli pencerede okunur. */}
      {solution && (
        <div data-quiz-solution-summary className="mb-3 flex items-start gap-2 text-[15px] leading-7 text-[var(--app-text)]">
          <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-[var(--app-warn)]" aria-hidden="true" />
          <span className="line-clamp-2">{renderRichText(solution)}</span>
        </div>
      )}

      {/* Alt bar: butonlar + sosyal ikonlar */}
      <div data-quiz-feedback-actions className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onNext}
          className="min-h-11 w-full rounded-xl bg-[var(--focus)] px-5 py-2.5 text-sm font-bold tracking-wide text-white shadow-[0_4px_0_var(--app-accent-strong)] transition-all hover:bg-[var(--focus-light)] active:translate-y-1 active:shadow-none sm:w-auto"
        >
          <span>{isLastQuestion ? 'Sonucu Gör' : 'Sonraki Soru'}</span>
          <ArrowRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
        </button>

        {/* Aksiyon ikonları */}
        <div className="flex flex-wrap items-center gap-2">
          {(solution || correctText) && (
            <button
              type="button"
              onClick={() => setSolutionOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={solutionOpen}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] px-3 py-2 text-xs font-semibold text-[var(--app-accent-text)] transition-colors hover:bg-[var(--app-card)]"
            >
              <ScrollText className="h-4 w-4" aria-hidden="true" />
              Ayrıntılı Çözüm
            </button>
          )}

          {/* Konu Anlatımı — belirgin buton */}
          <TopicExplanationButton
            topic={topic}
            subject={question.game}
            difficulty={question.difficulty}
            questionContext={topicContext}
            appearance="learning"
          />

          <LikeButton initialCount={0} size="sm" appearance="learning" />

          {onOpenComments && (
            <button
              type="button"
              onClick={onOpenComments}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--app-card)]/80 text-[var(--app-text-sub)] transition-colors hover:bg-[var(--app-card)] hover:text-[var(--app-accent-text)]"
              aria-label="Yorumlar"
            >
              <MessagesSquare className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

        </div>
      </div>
    </div>
    {solutionOpen && (
      <AcademyDialog title="Ayrıntılı çözüm" size="compact" mobileSheet onClose={() => setSolutionOpen(false)}>
        <div data-answer-solution-dialog className="space-y-4">
          <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--app-accent-text)]">Soru</p>
            {question.content.passage && (
              <p className="mb-3 whitespace-pre-line text-sm leading-6 text-[var(--app-text-sub)]">{renderRichText(question.content.passage)}</p>
            )}
            <p className="text-base font-bold leading-7 text-[var(--app-text)]">
              {renderRichText(question.content.question || question.content.sentence)}
            </p>
          </section>

          {!isCorrect && selectedText && (
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--app-danger-border)] bg-[var(--app-danger-tint)] p-4 text-[var(--app-danger-ink)]">
              <X className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em]">Senin cevabın</p>
                <p className="mt-1 text-sm font-semibold leading-6">{getOptionLetter(selectedOption)}) {renderRichText(selectedText)}</p>
              </div>
            </div>
          )}

          {correctText && (
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--app-success-border)] bg-[var(--app-success-tint)] p-4 text-[var(--app-success-ink)]">
              <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em]">Doğru cevap</p>
                <p className="mt-1 text-sm font-semibold leading-6">{getOptionLetter(correctAnswer)}) {renderRichText(correctText)}</p>
              </div>
            </div>
          )}

          {solution && (
            <section className="rounded-2xl border border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] p-4 text-[var(--app-text)]">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-[var(--app-warn-ink)]">
                <Lightbulb className="h-5 w-5" aria-hidden="true" /> Çözümün mantığı
              </h3>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-7">{renderRichText(solution)}</p>
            </section>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setSolutionOpen(false)} className="min-h-11 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] px-4 text-sm font-bold text-[var(--app-text)]">Kapat</button>
            <button type="button" onClick={onNext} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--app-accent)] px-5 text-sm font-bold text-white">
              {isLastQuestion ? 'Sonucu Gör' : 'Sonraki Soru'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </AcademyDialog>
    )}
    </>
  )
}

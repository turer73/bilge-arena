'use client'

import { useEffect, useRef } from 'react'
import { Bug, MessageCircle } from 'lucide-react'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { getOptionLetter } from '@/lib/utils/question'
import { stripRichText } from '@/lib/utils/rich-text'
import { LikeButton } from '@/components/social/like-button'
import { TopicExplanationButton } from '@/components/bilge-tahta/topic-explanation-button'

interface ExplanationPanelProps {
  question: PublicQuestion
  selectedOption: number
  isCorrect: boolean
  correctOption: number
  solution: string | null
  isLastQuestion: boolean
  onNext: () => void
  onOpenComments?: () => void
  onOpenReport?: () => void
}

export function ExplanationPanel({
  question,
  selectedOption: _selectedOption,
  isCorrect,
  correctOption,
  solution,
  isLastQuestion,
  onNext,
  onOpenComments,
  onOpenReport,
}: ExplanationPanelProps) {
  const correctAnswer = correctOption
  const correctText = correctAnswer >= 0 ? question.content.options[correctAnswer] : null

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

  return (
    <div
      ref={rootRef}
      className={`animate-fadeUp rounded-[22px] border-2 p-4 ${
        isCorrect
          ? 'border-[#86efac] bg-[#f0fdf4] shadow-[0_5px_0_#86efac]'
          : 'border-[#fda4af] bg-[#fff1f2] shadow-[0_5px_0_#fda4af]'
      }`}
    >
      {/* Sonuc mesaji */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`mb-2 text-base font-bold leading-6 ${
          isCorrect ? 'text-[#15803d]' : 'text-[#be123c]'
        }`}
      >
        {isCorrect
          ? '✓ Doğru! Mükemmel 🎉'
          : correctText
            ? `✗ Yanlış. Doğru: ${getOptionLetter(correctAnswer)}) ${correctText}`
            : '⏱ Süre doldu. Doğru cevap şu anda alınamadı.'}
      </div>

      {/* Aciklama */}
      {solution && (
        <div className="mb-4 text-[15px] leading-7 text-[#4b5157]">
          📌 {solution}
        </div>
      )}

      {/* Alt bar: butonlar + sosyal ikonlar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onNext}
          className="min-h-11 w-full rounded-xl bg-[var(--focus)] px-5 py-2.5 text-sm font-bold tracking-wide text-white shadow-[0_4px_0_#1d4ed8] transition-all hover:bg-[var(--focus-light)] active:translate-y-1 active:shadow-none sm:w-auto"
        >
          {isLastQuestion ? 'Sonucu Gor →' : 'Sonraki Soru →'}
        </button>

        {/* Aksiyon ikonları */}
        <div className="flex flex-wrap items-center gap-2">
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
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/80 text-[#64748b] transition-colors hover:bg-white hover:text-[#2563eb]"
              aria-label="Yorumlar"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/80 text-[#f97316] transition-colors hover:bg-white hover:text-[#ea580c]"
              aria-label="Hata bildir"
            >
              <Bug className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

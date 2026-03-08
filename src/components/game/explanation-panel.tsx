'use client'

import type { Question } from '@/types/database'
import { getOptionLetter } from '@/lib/utils/question'
import { LikeButton } from '@/components/social/like-button'

interface ExplanationPanelProps {
  question: Question
  selectedOption: number
  isCorrect: boolean
  isLastQuestion: boolean
  onNext: () => void
  onOpenComments?: () => void
  onOpenReport?: () => void
}

export function ExplanationPanel({
  question,
  selectedOption,
  isCorrect,
  isLastQuestion,
  onNext,
  onOpenComments,
  onOpenReport,
}: ExplanationPanelProps) {
  const correctAnswer = question.content.answer
  const correctText = question.content.options[correctAnswer]

  return (
    <div
      className="animate-fadeUp rounded-xl border-[1.5px] px-[18px] py-[14px]"
      style={{
        background: isCorrect
          ? 'color-mix(in srgb, var(--growth) 12%, transparent)'
          : 'color-mix(in srgb, var(--urgency) 10%, transparent)',
        borderColor: isCorrect
          ? 'color-mix(in srgb, var(--growth) 33%, transparent)'
          : 'color-mix(in srgb, var(--urgency) 27%, transparent)',
      }}
    >
      {/* Sonuc mesaji */}
      <div
        className="mb-1.5 text-[13px] font-bold"
        style={{ color: isCorrect ? 'var(--growth)' : 'var(--urgency)' }}
      >
        {isCorrect
          ? '✓ Dogru! Mukemmel 🎉'
          : `✗ Yanlis. Dogru: ${getOptionLetter(correctAnswer)}) ${correctText}`}
      </div>

      {/* Aciklama */}
      {question.content.solution && (
        <div className="mb-2.5 text-xs leading-relaxed text-[var(--text-sub)]">
          📌 {question.content.solution}
        </div>
      )}

      {/* Alt bar: butonlar + sosyal ikonlar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onNext}
          className="rounded-lg bg-[var(--focus)] px-[18px] py-2 text-xs font-bold tracking-wider text-white transition-colors hover:bg-[var(--focus-light)]"
        >
          {isLastQuestion ? 'Sonucu Gor →' : 'Sonraki Soru →'}
        </button>

        {/* Sosyal ikonlar */}
        <div className="flex items-center gap-1">
          <LikeButton initialCount={0} size="sm" />

          {onOpenComments && (
            <button
              onClick={onOpenComments}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--focus)]"
              aria-label="Yorumlar"
            >
              <span className="text-xs">💬</span>
            </button>
          )}

          {onOpenReport && (
            <button
              onClick={onOpenReport}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--reward)]"
              aria-label="Hata bildir"
            >
              <span className="text-xs">🐛</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

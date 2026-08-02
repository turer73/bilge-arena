'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils/cn'
import { getOptionLetter } from '@/lib/utils/question'
import { renderRichText, stripRichText } from '@/lib/utils/rich-text'

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dim' | 'selected'

interface OptionButtonProps {
  index: number
  text: string
  state: OptionState
  onClick: () => void
  delay?: number
}

const stateStyles: Record<OptionState, {
  bg: string
  border: string
  text: string
  badgeBg: string
  badgeText: string
  shadow: string
}> = {
  idle: {
    bg: 'bg-[var(--card-bg)]',
    border: 'border-[var(--border)]',
    text: 'text-[var(--text)]',
    badgeBg: 'bg-[var(--focus-bg)]',
    badgeText: 'text-[var(--focus-text)]',
    shadow: '',
  },
  correct: {
    // OPAK (transparent DEĞİL): video zeminde şık saydam kalıp metni okunmaz yapıyordu
    bg: 'bg-[color-mix(in_srgb,var(--growth)_15%,var(--card-bg))]',
    border: 'border-[var(--growth)]',
    text: 'text-[var(--growth-text)]',
    badgeBg: 'bg-[color-mix(in_srgb,var(--growth)_20%,transparent)]',
    badgeText: 'text-[var(--growth-text)]',
    shadow: 'shadow-[0_0_18px_rgba(16,185,129,0.33)]',
  },
  wrong: {
    bg: 'bg-[color-mix(in_srgb,var(--urgency)_12%,var(--card-bg))]',
    border: 'border-[var(--urgency)]',
    text: 'text-[var(--urgency-text)]',
    badgeBg: 'bg-[color-mix(in_srgb,var(--urgency)_14%,transparent)]',
    badgeText: 'text-[var(--urgency-text)]',
    shadow: 'shadow-[0_0_14px_rgba(220,38,38,0.27)]',
  },
  // Duello: cevap gosterilmeden secilen sikki vurgular (notr — dogru/yanlis belli etmez)
  selected: {
    bg: 'bg-[color-mix(in_srgb,var(--focus)_14%,var(--card-bg))]',
    border: 'border-[var(--focus)]',
    text: 'text-[var(--text)]',
    badgeBg: 'bg-[var(--focus)]',
    badgeText: 'text-white',
    shadow: '',
  },
  // dim: cevap sonrası seçilmeyen/yanlış-olmayan şıklar. opacity-40 KULLANMA —
  // video zeminde tüm butonu yarı-saydam yapıp metni okunmaz kılıyordu. Opak
  // kalsın, sönükleştirme metin/badge rengiyle (muted) yapılsın.
  dim: {
    bg: 'bg-[var(--card-bg)]',
    border: 'border-[var(--border)]',
    text: 'text-[var(--text-muted)]',
    badgeBg: 'bg-[var(--border)]',
    badgeText: 'text-[var(--text-muted)]',
    shadow: '',
  },
}

export const OptionButton = memo(function OptionButton({ index, text, state, onClick, delay = 0 }: OptionButtonProps) {
  const s = stateStyles[state]
  const optionLetter = getOptionLetter(index)
  const stateLabel = state === 'correct'
    ? ' Doğru cevap.'
    : state === 'wrong'
      ? ' Yanlış cevap.'
      : state === 'selected'
        ? ' Seçildi.'
        : ''

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state !== 'idle'}
      aria-label={`${optionLetter} seçeneği: ${stripRichText(text)}${stateLabel}`}
      className={cn(
        'relative min-h-14 w-full overflow-hidden rounded-xl border-[1.5px] px-4 py-3.5 md:px-5 md:py-4 xl:px-6 xl:py-[18px]',
        'flex items-center gap-2 text-left md:gap-3 xl:gap-4',
        'transition-all duration-150',
        state === 'idle' && 'cursor-pointer hover:translate-x-1 active:translate-x-0.5 active:scale-[0.99]',
        state === 'correct' && 'animate-bounce-once',
        state === 'wrong' && 'animate-shake',
        s.bg, s.border, s.shadow,
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {/* Harf badge */}
      <span
        className={cn(
          'flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg md:h-9 md:min-w-9',
          'font-display text-xs font-black md:text-sm',
          'border-[1.5px]',
          s.badgeBg, s.badgeText, s.border,
        )}
      >
        {optionLetter}
      </span>

      {/* Metin */}
      <span className={cn('text-[15px] font-medium leading-6 md:text-base xl:text-[17px] xl:leading-7', s.text)}>
        {renderRichText(text)}
      </span>

      {/* Dogru/yanlis ikonu */}
      {state === 'correct' && (
        <span className="ml-auto shrink-0 text-lg text-[var(--growth-text)]" aria-hidden="true">✓</span>
      )}
      {state === 'wrong' && (
        <span className="ml-auto shrink-0 text-lg text-[var(--urgency-text)]" aria-hidden="true">✗</span>
      )}
    </button>
  )
})

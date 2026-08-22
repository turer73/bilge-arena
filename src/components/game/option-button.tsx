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
    bg: 'bg-[var(--app-card)]',
    border: 'border-[var(--app-border)]',
    text: 'text-[var(--app-text)]',
    badgeBg: 'bg-[var(--app-accent-tint)]',
    badgeText: 'text-[var(--app-accent-text)]',
    shadow: 'shadow-[0_4px_0_var(--app-shadow)]',
  },
  correct: {
    // OPAK (transparent DEĞİL): video zeminde şık saydam kalıp metni okunmaz yapıyordu
    bg: 'bg-[var(--app-success-tint)]',
    border: 'border-[var(--app-success-solid)]',
    text: 'text-[var(--app-success-ink)]',
    badgeBg: 'bg-[var(--app-success-border)]',
    badgeText: 'text-[var(--app-success-ink)]',
    shadow: 'shadow-[0_4px_0_var(--app-success)]',
  },
  wrong: {
    bg: 'bg-[var(--app-danger-tint)]',
    border: 'border-[var(--app-danger)]',
    text: 'text-[var(--app-danger-ink)]',
    badgeBg: 'bg-[var(--app-danger-border)]',
    badgeText: 'text-[var(--app-danger-ink)]',
    shadow: 'shadow-[0_4px_0_var(--app-danger)]',
  },
  // Duello: cevap gosterilmeden secilen sikki vurgular (notr — dogru/yanlis belli etmez)
  selected: {
    bg: 'bg-[var(--app-accent-tint)]',
    border: 'border-[var(--app-accent)]',
    text: 'text-[var(--app-accent-ink)]',
    badgeBg: 'bg-[var(--app-accent)]',
    badgeText: 'text-white',
    shadow: '',
  },
  // dim: cevap sonrası seçilmeyen/yanlış-olmayan şıklar. opacity-40 KULLANMA —
  // video zeminde tüm butonu yarı-saydam yapıp metni okunmaz kılıyordu. Opak
  // kalsın, sönükleştirme metin/badge rengiyle (muted) yapılsın.
  dim: {
    bg: 'bg-[var(--app-hover)]',
    border: 'border-[var(--app-border)]',
    text: 'text-[var(--app-text-muted)]',
    badgeBg: 'bg-[var(--app-border)]',
    badgeText: 'text-[var(--app-text-muted)]',
    shadow: 'shadow-[0_3px_0_var(--app-border)]',
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
        'relative flex min-h-[58px] w-full items-center gap-2 overflow-hidden rounded-[18px] border-2 px-3.5 py-3 text-left',
        'transition-all duration-150',
        state === 'idle' && 'cursor-pointer active:translate-y-1 active:shadow-none',
        state === 'correct' && 'animate-bounce-once',
        state === 'wrong' && 'animate-shake',
        s.bg, s.border, s.shadow,
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {/* Harf badge */}
      <span
        className={cn(
          'flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl',
          'font-display text-xs font-black',
          'border-[1.5px]',
          s.badgeBg, s.badgeText, s.border,
        )}
      >
        {optionLetter}
      </span>

      {/* Metin */}
      <span className={cn('text-[15px] font-semibold leading-6', s.text)}>
        {renderRichText(text)}
      </span>

      {/* Dogru/yanlis ikonu */}
      {state === 'correct' && (
        <span className="ml-auto shrink-0 text-lg text-[var(--app-success-ink)]" aria-hidden="true">✓</span>
      )}
      {state === 'wrong' && (
        <span className="ml-auto shrink-0 text-lg text-[var(--app-danger-ink)]" aria-hidden="true">✗</span>
      )}
    </button>
  )
})

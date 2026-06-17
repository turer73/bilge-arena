'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils/cn'
import { getOptionLetter } from '@/lib/utils/question'
import { renderRichText } from '@/lib/utils/rich-text'

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
    badgeText: 'text-[var(--focus)]',
    shadow: '',
  },
  correct: {
    // OPAK (transparent DEĞİL): video zeminde şık saydam kalıp metni okunmaz yapıyordu
    bg: 'bg-[color-mix(in_srgb,var(--growth)_15%,var(--card-bg))]',
    border: 'border-[var(--growth)]',
    text: 'text-[var(--growth)]',
    badgeBg: 'bg-[color-mix(in_srgb,var(--growth)_20%,transparent)]',
    badgeText: 'text-[var(--growth)]',
    shadow: 'shadow-[0_0_18px_rgba(16,185,129,0.33)]',
  },
  wrong: {
    bg: 'bg-[color-mix(in_srgb,var(--urgency)_12%,var(--card-bg))]',
    border: 'border-[var(--urgency)]',
    text: 'text-[var(--urgency)]',
    badgeBg: 'bg-[color-mix(in_srgb,var(--urgency)_14%,transparent)]',
    badgeText: 'text-[var(--urgency)]',
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

  return (
    <button
      onClick={onClick}
      disabled={state !== 'idle'}
      className={cn(
        'relative w-full overflow-hidden rounded-lg border-[1.5px] px-3 py-2.5 md:rounded-xl md:px-4 md:py-[13px] xl:px-5 xl:py-4 2xl:py-5',
        'flex items-center gap-2 text-left md:gap-3 xl:gap-4',
        'transition-all duration-150',
        state === 'idle' && 'hover:translate-x-2 active:translate-x-[5px] active:scale-[0.99] cursor-pointer',
        state === 'correct' && 'animate-bounce-once',
        state === 'wrong' && 'animate-shake',
        s.bg, s.border, s.shadow,
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {/* Harf badge */}
      <span
        className={cn(
          'flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-md md:h-7 md:min-w-[28px] md:rounded-lg xl:h-8 xl:min-w-[32px] 2xl:h-9 2xl:min-w-[36px]',
          'font-display text-[10px] font-black md:text-[11px] xl:text-xs 2xl:text-sm',
          'border-[1.5px]',
          s.badgeBg, s.badgeText, s.border,
        )}
      >
        {getOptionLetter(index)}
      </span>

      {/* Metin */}
      <span className={cn('text-[12px] font-medium leading-[1.45] md:text-[13.5px] xl:text-[15px] 2xl:text-base', s.text)}>
        {renderRichText(text)}
      </span>

      {/* Dogru/yanlis ikonu */}
      {state === 'correct' && (
        <span className="ml-auto shrink-0 text-base text-[var(--growth)]">✓</span>
      )}
      {state === 'wrong' && (
        <span className="ml-auto shrink-0 text-sm text-[var(--urgency)]">✗</span>
      )}
    </button>
  )
})

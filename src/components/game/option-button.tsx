'use client'

import { cn } from '@/lib/utils/cn'
import { getOptionLetter } from '@/lib/utils/question'

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

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
    bg: 'bg-[color-mix(in_srgb,var(--growth)_15%,transparent)]',
    border: 'border-[var(--growth)]',
    text: 'text-[var(--growth)]',
    badgeBg: 'bg-[color-mix(in_srgb,var(--growth)_20%,transparent)]',
    badgeText: 'text-[var(--growth)]',
    shadow: 'shadow-[0_0_18px_rgba(16,185,129,0.33)]',
  },
  wrong: {
    bg: 'bg-[color-mix(in_srgb,var(--urgency)_12%,transparent)]',
    border: 'border-[var(--urgency)]',
    text: 'text-[var(--urgency)]',
    badgeBg: 'bg-[color-mix(in_srgb,var(--urgency)_14%,transparent)]',
    badgeText: 'text-[var(--urgency)]',
    shadow: 'shadow-[0_0_14px_rgba(220,38,38,0.27)]',
  },
  dim: {
    bg: 'bg-[var(--card-bg)] opacity-40',
    border: 'border-[var(--border)]',
    text: 'text-[var(--text-sub)]',
    badgeBg: 'bg-[var(--border)]',
    badgeText: 'text-[var(--text-sub)]',
    shadow: '',
  },
}

export function OptionButton({ index, text, state, onClick, delay = 0 }: OptionButtonProps) {
  const s = stateStyles[state]

  return (
    <button
      onClick={onClick}
      disabled={state !== 'idle'}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border-[1.5px] px-4 py-[13px]',
        'flex items-center gap-3 text-left',
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
          'flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-lg',
          'font-display text-[11px] font-black',
          'border-[1.5px]',
          s.badgeBg, s.badgeText, s.border,
        )}
      >
        {getOptionLetter(index)}
      </span>

      {/* Metin */}
      <span className={cn('text-[13.5px] font-medium leading-[1.45]', s.text)}>
        {text}
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
}

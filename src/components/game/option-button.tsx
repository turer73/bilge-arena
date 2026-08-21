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
    bg: 'bg-white',
    border: 'border-[#dfe3e7]',
    text: 'text-[#45494e]',
    badgeBg: 'bg-[#eff6ff]',
    badgeText: 'text-[#2563eb]',
    shadow: 'shadow-[0_4px_0_#dfe3e7]',
  },
  correct: {
    // OPAK (transparent DEĞİL): video zeminde şık saydam kalıp metni okunmaz yapıyordu
    bg: 'bg-[#f0fdf4]',
    border: 'border-[#22c55e]',
    text: 'text-[#15803d]',
    badgeBg: 'bg-[#dcfce7]',
    badgeText: 'text-[#15803d]',
    shadow: 'shadow-[0_4px_0_#16a34a]',
  },
  wrong: {
    bg: 'bg-[#fff1f2]',
    border: 'border-[#fb7185]',
    text: 'text-[#be123c]',
    badgeBg: 'bg-[#ffe4e6]',
    badgeText: 'text-[#be123c]',
    shadow: 'shadow-[0_4px_0_#e11d48]',
  },
  // Duello: cevap gosterilmeden secilen sikki vurgular (notr — dogru/yanlis belli etmez)
  selected: {
    bg: 'bg-[#eff6ff]',
    border: 'border-[#3b82f6]',
    text: 'text-[#1d4ed8]',
    badgeBg: 'bg-[#2563eb]',
    badgeText: 'text-white',
    shadow: '',
  },
  // dim: cevap sonrası seçilmeyen/yanlış-olmayan şıklar. opacity-40 KULLANMA —
  // video zeminde tüm butonu yarı-saydam yapıp metni okunmaz kılıyordu. Opak
  // kalsın, sönükleştirme metin/badge rengiyle (muted) yapılsın.
  dim: {
    bg: 'bg-[#f8fafc]',
    border: 'border-[#e5e7eb]',
    text: 'text-[#94a3b8]',
    badgeBg: 'bg-[#e5e7eb]',
    badgeText: 'text-[#94a3b8]',
    shadow: 'shadow-[0_3px_0_#e5e7eb]',
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
        <span className="ml-auto shrink-0 text-lg text-[#15803d]" aria-hidden="true">✓</span>
      )}
      {state === 'wrong' && (
        <span className="ml-auto shrink-0 text-lg text-[#be123c]" aria-hidden="true">✗</span>
      )}
    </button>
  )
})

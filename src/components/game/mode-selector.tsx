'use client'

import { MODES, type QuizMode } from '@/lib/constants/modes'
import { cn } from '@/lib/utils/cn'

interface ModeSelectorProps {
  selectedMode: string
  onSelect: (mode: QuizMode) => void
}

export function ModeSelector({ selectedMode, onSelect }: ModeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {MODES.map((mode) => {
        const active = mode.id === selectedMode
        return (
          <button
            key={mode.id}
            onClick={() => onSelect(mode)}
            className={cn(
              'rounded-xl border-[1.5px] p-3 text-left transition-all duration-200',
              'hover:-translate-y-0.5',
              active
                // OPAK seçili kart: video zeminde --focus-bg (rgba .12) saydamdı, yazı kayboluyordu
                ? 'border-[var(--focus)] bg-[color-mix(in_srgb,var(--focus)_14%,var(--card-bg))]'
                : 'border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--focus-border)]'
            )}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">{mode.icon}</span>
              <span
                className={cn(
                  'text-xs font-bold',
                  active ? 'text-[var(--focus)]' : 'text-[var(--text)]'
                )}
              >
                {mode.name}
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-sub)]">{mode.description}</p>
          </button>
        )
      })}
    </div>
  )
}

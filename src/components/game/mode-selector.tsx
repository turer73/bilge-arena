'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { MODES, type QuizMode } from '@/lib/constants/modes'
import { cn } from '@/lib/utils/cn'

interface ModeSelectorProps {
  selectedMode: string
  onSelect: (mode: QuizMode) => void
  showAll: boolean
  onShowAllChange: (showAll: boolean) => void
}

const PRIMARY_MODE_IDS = new Set(['classic', 'deneme', 'practice'])

export function ModeSelector({
  selectedMode,
  onSelect,
  showAll,
  onShowAllChange,
}: ModeSelectorProps) {
  const primaryModes = MODES.filter((mode) => PRIMARY_MODE_IDS.has(mode.id))
  const selectedSecondary = MODES.find(
    (mode) => mode.id === selectedMode && !PRIMARY_MODE_IDS.has(mode.id)
  )
  const visibleModes = showAll
    ? MODES
    : selectedSecondary
      ? [...primaryModes, selectedSecondary]
      : primaryModes

  return (
    <div>
      <div className={cn('grid gap-2', showAll || selectedSecondary ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3')}>
        {visibleModes.map((mode) => {
          const active = mode.id === selectedMode
          return (
            <button
              type="button"
              key={mode.id}
              onClick={() => onSelect(mode)}
              aria-pressed={active}
              aria-label={`${mode.name}: ${mode.description}`}
              className={cn(
                'flex min-h-[104px] flex-col rounded-xl border-[1.5px] p-2.5 text-left transition-all duration-200 sm:min-h-[112px] sm:p-3',
                'hover:-translate-y-0.5',
                active
                  ? 'border-[var(--focus)] bg-[color-mix(in_srgb,var(--focus)_14%,var(--card-bg))] shadow-sm'
                  : 'border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--focus-border)]'
              )}
            >
              <span className="text-xl" aria-hidden="true">{mode.icon}</span>
              <span
                className={cn(
                  'mt-2 text-[13px] font-bold leading-tight sm:text-sm',
                  active ? 'text-[var(--focus-text)]' : 'text-[var(--text)]'
                )}
              >
                {mode.name}
              </span>
              <span className="mt-1 text-xs leading-4 text-[var(--text-sub)]">
                {mode.description}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => onShowAllChange(!showAll)}
        aria-expanded={showAll}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[var(--focus-text)] transition-colors hover:bg-[var(--focus-bg)] sm:text-sm"
      >
        {showAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {showAll ? 'Daha az mod göster' : 'Blitz, Maraton ve Boss modlarını göster'}
      </button>
    </div>
  )
}

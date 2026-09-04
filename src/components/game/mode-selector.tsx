'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { MODES, type QuizMode } from '@/lib/constants/modes'
import { cn } from '@/lib/utils/cn'

interface ModeSelectorProps {
  modes?: readonly QuizMode[]
  selectedMode: string
  onSelect: (mode: QuizMode) => void
  showAll: boolean
  onShowAllChange: (showAll: boolean) => void
}

const PRIMARY_MODE_IDS = new Set(['classic', 'deneme', 'practice'])

export function ModeSelector({
  modes = MODES,
  selectedMode,
  onSelect,
  showAll,
  onShowAllChange,
}: ModeSelectorProps) {
  const primaryModes = modes.filter((mode) => PRIMARY_MODE_IDS.has(mode.id))
  const selectedSecondary = modes.find(
    (mode) => mode.id === selectedMode && !PRIMARY_MODE_IDS.has(mode.id)
  )
  const visibleModes = showAll
    ? modes
    : selectedSecondary
      ? [...primaryModes, selectedSecondary]
      : primaryModes
  const activeMode = modes.find((mode) => mode.id === selectedMode) ?? modes[0]

  return (
    <div>
      <div className="scrollbar-none flex snap-x gap-1.5 overflow-x-auto pb-1">
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
                'flex min-h-14 min-w-[104px] snap-start items-center gap-1.5 rounded-[17px] border-2 px-2 py-2 text-left transition-all duration-200 active:translate-y-0.5',
                active
                  ? 'border-[var(--app-accent)] bg-[var(--app-accent-tint)] shadow-[0_4px_0_var(--app-shadow-accent)]'
                  : 'border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_3px_0_var(--app-shadow)] hover:border-[var(--app-shadow-accent)]'
              )}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${active ? 'bg-[var(--app-card)]' : 'bg-[var(--app-bg)]'}`} aria-hidden="true">{mode.icon}</span>
              <span
                className={cn(
                  'text-[12px] font-black leading-tight',
                  active ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-text)]'
                )}
              >
                {mode.name}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[var(--app-bg)] px-3 py-2.5">
        <div>
          <p className="text-xs font-black text-[var(--app-text)]">{activeMode.name}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-[var(--app-text-sub)]">{activeMode.description}</p>
        </div>
        <span className="shrink-0 rounded-xl bg-[var(--app-card)] px-2 py-1 text-[10px] font-black text-[var(--app-accent-text)] shadow-[0_2px_0_var(--app-shadow)]">{activeMode.questionCount} soru</span>
      </div>

      <button
        type="button"
        onClick={() => onShowAllChange(!showAll)}
        aria-expanded={showAll}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-extrabold text-[var(--app-accent-text)] transition-colors hover:bg-[var(--app-accent-tint)] sm:text-sm"
      >
        {showAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {showAll ? 'Daha az mod göster' : 'Blitz, Maraton ve Boss modlarını göster'}
      </button>
    </div>
  )
}

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
  const activeMode = MODES.find((mode) => mode.id === selectedMode) ?? MODES[0]

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
                  ? 'border-[#2563eb] bg-[#eff6ff] shadow-[0_4px_0_#bfdbfe]'
                  : 'border-[#e5e7eb] bg-white shadow-[0_3px_0_#dfe3e7] hover:border-[#bfdbfe]'
              )}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${active ? 'bg-white' : 'bg-[#f7f8fa]'}`} aria-hidden="true">{mode.icon}</span>
              <span
                className={cn(
                  'text-[12px] font-black leading-tight',
                  active ? 'text-[#2563eb]' : 'text-[#45494e]'
                )}
              >
                {mode.name}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#f7f8fa] px-3 py-2.5">
        <div>
          <p className="text-xs font-black text-[#45494e]">{activeMode.name}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-[#7d858d]">{activeMode.description}</p>
        </div>
        <span className="shrink-0 rounded-xl bg-white px-2 py-1 text-[10px] font-black text-[#2563eb] shadow-[0_2px_0_#dfe3e7]">{activeMode.questionCount} soru</span>
      </div>

      <button
        type="button"
        onClick={() => onShowAllChange(!showAll)}
        aria-expanded={showAll}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-extrabold text-[#2563eb] transition-colors hover:bg-[#eff6ff] sm:text-sm"
      >
        {showAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {showAll ? 'Daha az mod göster' : 'Blitz, Maraton ve Boss modlarını göster'}
      </button>
    </div>
  )
}

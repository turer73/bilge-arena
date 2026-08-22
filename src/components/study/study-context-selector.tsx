'use client'

import type { GameDefinition, GameSlug } from '@/lib/constants/games'
import { BookOpenText, Calculator, FlaskConical, Globe2, Languages, type LucideIcon } from 'lucide-react'

interface StudyContextSelectorProps {
  games: GameDefinition[]
  selectedGame: GameSlug
  examRefs: string[]
  selectedExamRef: string | null
  onGameChange: (game: GameSlug) => void
  onExamRefChange: (examRef: string) => void
}

const GAME_ICONS: Record<GameSlug, LucideIcon> = {
  matematik: Calculator,
  turkce: BookOpenText,
  fen: FlaskConical,
  sosyal: Globe2,
  wordquest: Languages,
}

/** Ders Çalış ekranındaki görünür ve profil-kapsamlı çalışma bağlamı. */
export function StudyContextSelector({
  games,
  selectedGame,
  examRefs,
  selectedExamRef,
  onGameChange,
  onExamRefChange,
}: StudyContextSelectorProps) {
  return (
    <section
      aria-labelledby="study-context-title"
      className="animate-fadeUp rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-3 shadow-[0_5px_0_var(--app-border)] md:p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.16em] text-[var(--app-accent-text)]">
            ÇALIŞMA ODAĞIN
          </p>
          <h2 id="study-context-title" className="mt-0.5 text-sm font-black text-[var(--app-text)]">
            Dersini ve sınavını seç
          </h2>
        </div>
        <span className="text-right text-[10px] font-semibold leading-snug text-[var(--app-text-muted)]">
          İstediğin zaman değiştirebilirsin
        </span>
      </div>

      <fieldset>
        <legend className="sr-only">Ders seçimi</legend>
        <div className="scrollbar-none flex snap-x gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {games.map((game) => {
            const selected = game.slug === selectedGame
            const Icon = GAME_ICONS[game.slug]
            return (
              <button
                key={game.slug}
                type="button"
                aria-pressed={selected}
                onClick={() => onGameChange(game.slug)}
                className="flex min-h-12 min-w-[116px] shrink-0 snap-start items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-xs font-black transition-[border-color,background-color,transform] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] lg:min-w-0"
                style={{
                  borderColor: selected ? `var(--${game.color})` : 'var(--app-border)',
                  background: selected
                    ? `color-mix(in srgb, var(--${game.color}) 12%, var(--app-card))`
                    : 'var(--app-card-sunken)',
                  color: selected ? 'var(--app-text)' : 'var(--app-text-sub)',
                  boxShadow: selected ? `0 3px 0 color-mix(in srgb, var(--${game.color}) 34%, transparent)` : undefined,
                }}
              >
                <Icon size={19} strokeWidth={2.7} aria-hidden="true" />
                <span className="min-w-0 truncate">{game.name}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {examRefs.length > 0 && (
        <fieldset className="mt-3 border-t-2 border-[var(--app-border-soft)] pt-3">
          <legend className="sr-only">Sınav seçimi</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-black text-[var(--app-text-sub)]">Sınav</span>
            {examRefs.map((examRef) => {
              const selected = examRef === selectedExamRef
              return (
                <button
                  key={examRef}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onExamRefChange(examRef)}
                  className={`min-h-11 rounded-2xl border-2 px-4 text-xs font-black transition-[transform,background-color] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] ${
                    selected
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white shadow-[0_3px_0_var(--app-accent-strong)]'
                      : 'border-[var(--app-border)] bg-[var(--app-card-sunken)] text-[var(--app-text-sub)]'
                  }`}
                >
                  {examRef}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
    </section>
  )
}

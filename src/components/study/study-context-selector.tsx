'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import type { GameDefinition, GameSlug } from '@/lib/constants/games'
import { BookOpenText, Calculator, FlaskConical, Globe2, Languages, type LucideIcon } from 'lucide-react'

interface StudyContextSelectorProps {
  games: GameDefinition[]
  selectedGame: GameSlug
  examRefs: string[]
  selectedExamRef: string | null
  onGameChange: (game: GameSlug) => void
  onExamRefChange: (examRef: string) => void
  compact?: boolean
  collapsible?: boolean
  eyebrow?: string
  title?: string
  footer?: ReactNode
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
  compact = false,
  collapsible = false,
  eyebrow = 'ÇALIŞMA ODAĞIN',
  title = 'Dersini ve sınavını seç',
  footer,
}: StudyContextSelectorProps) {
  const headingId = useId()
  const choicesId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(false)
  const selectedGameName = games.find((game) => game.slug === selectedGame)?.name ?? selectedGame
  const summary = `${selectedGameName} · ${selectedExamRef ?? 'Serbest'}`

  return (
    <section
      aria-labelledby={headingId}
      className={`min-w-0 overflow-hidden rounded-[22px] border-[var(--app-border)] bg-[var(--app-card)] p-3 md:p-4 ${collapsible ? 'border shadow-sm' : 'border-2 shadow-[0_5px_0_var(--app-border)]'} ${compact ? 'lg:h-full' : ''}`}
      onKeyDown={(event) => {
        if (collapsible && expanded && event.key === 'Escape') {
          event.preventDefault()
          setExpanded(false)
          toggleRef.current?.focus()
        }
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.08em] text-[var(--app-accent-text)]">
            {eyebrow}
          </p>
          <h2 id={headingId} className="mt-1 text-base font-black leading-snug text-[var(--app-text)]">
            {collapsible ? summary : title}
          </h2>
        </div>
        {collapsible ? <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={choicesId}
          onClick={() => setExpanded((current) => !current)}
          className="min-h-11 shrink-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-sunken)] px-3 text-sm font-bold text-[var(--app-accent-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
        >
          {expanded ? 'Tamam' : 'Değiştir'}
        </button> : <span className="hidden max-w-28 shrink-0 text-right text-xs font-semibold leading-snug text-[var(--app-text-muted)] min-[400px]:block">
          İstediğin zaman değiştirebilirsin
        </span>}
      </div>

      <div id={choicesId} hidden={collapsible && !expanded}>
        <fieldset className="mt-3">
          <legend className="sr-only">Ders seçimi</legend>
          <div
            data-study-game-grid
            className={`grid min-w-0 grid-cols-2 gap-2 min-[420px]:grid-cols-3 ${compact ? 'lg:grid-cols-2' : 'lg:grid-cols-5'}`}
          >
            {games.map((game) => {
              const selected = game.slug === selectedGame
              const Icon = GAME_ICONS[game.slug]
              return (
                <button
                  key={game.slug}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onGameChange(game.slug)}
                  className="flex min-h-[52px] w-full min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 text-left text-xs font-bold transition-[border-color,background-color,transform] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] sm:px-3"
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
                  <span className="min-w-0 break-words leading-tight">{game.name}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {examRefs.length > 0 && (
          <fieldset className="mt-3 border-t border-[var(--app-border-soft)] pt-3">
            <legend className="sr-only">Sınav seçimi</legend>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-bold text-[var(--app-text-sub)]">Sınav</span>
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
      </div>

      {footer && (
        <div data-study-context-footer className="mt-3 border-t border-[var(--app-border-soft)] pt-3">
          {footer}
        </div>
      )}
    </section>
  )
}

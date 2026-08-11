'use client'

import type { GameDefinition, GameSlug } from '@/lib/constants/games'

interface StudyContextSelectorProps {
  games: GameDefinition[]
  selectedGame: GameSlug
  examRefs: string[]
  selectedExamRef: string | null
  onGameChange: (game: GameSlug) => void
  onExamRefChange: (examRef: string) => void
}

const GAME_ICONS: Record<GameSlug, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '📖',
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
      className="animate-fadeUp rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-3 shadow-sm md:p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--focus-text)]">
            ÇALIŞMA ODAĞIN
          </p>
          <h2 id="study-context-title" className="mt-0.5 text-sm font-bold text-[var(--text)]">
            Dersini ve sınavını seç
          </h2>
        </div>
        <span className="text-right text-[10px] leading-snug text-[var(--text-sub)]">
          İstediğin zaman değiştirebilirsin
        </span>
      </div>

      <fieldset>
        <legend className="sr-only">Ders seçimi</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {games.map((game) => {
            const selected = game.slug === selectedGame
            return (
              <button
                key={game.slug}
                type="button"
                aria-pressed={selected}
                onClick={() => onGameChange(game.slug)}
                className="flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition-[border-color,background-color,transform] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                style={{
                  borderColor: selected ? `var(--${game.color})` : 'var(--border)',
                  background: selected
                    ? `color-mix(in srgb, var(--${game.color}) 12%, var(--card-bg))`
                    : 'var(--surface)',
                  color: selected ? 'var(--text)' : 'var(--text-sub)',
                }}
              >
                <span className="text-lg" aria-hidden="true">{GAME_ICONS[game.slug]}</span>
                <span className="min-w-0 truncate">{game.name}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {examRefs.length > 0 && (
        <fieldset className="mt-3 border-t border-[var(--border)] pt-3">
          <legend className="sr-only">Sınav seçimi</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-bold text-[var(--text-sub)]">Sınav</span>
            {examRefs.map((examRef) => {
              const selected = examRef === selectedExamRef
              return (
                <button
                  key={examRef}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onExamRefChange(examRef)}
                  className={`min-h-11 rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${
                    selected
                      ? 'border-[var(--focus)] bg-[var(--focus)] text-white'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-sub)] hover:border-[var(--focus)]/50 hover:text-[var(--text)]'
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

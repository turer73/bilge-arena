'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock3, SlidersHorizontal } from 'lucide-react'
import { GAMES, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { MODES, type QuizMode, DENEME_CONFIGS } from '@/lib/constants/modes'
import { ModeSelector } from './mode-selector'
import { StreakBadge } from './streak-badge'
import { SoundToggle } from './sound-toggle'
import { XPBar } from './xp-bar'
import { getLevelFromXP } from '@/lib/constants/levels'
import { QuizLimitBanner } from '@/components/premium/quiz-limit-banner'
import { AdBanner } from '@/components/ads/ad-banner'

interface LobbyProps {
  game: GameSlug
  selectedMode: string
  onSelectMode: (mode: QuizMode) => void
  onStart: () => void
  onLimitReached?: () => void
  userXP?: number
  userStreak?: number
  selectedCategory: string | null
  onSelectCategory: (category: string | null) => void
  selectedDifficulty: number | null
  onSelectDifficulty: (difficulty: number | null) => void
  selectedExamRef: string | null
  onSelectExamRef: (examRef: string | null) => void
  quizLimit?: {
    canPlay: boolean
    remaining: number
    isPremium: boolean
    isGuest: boolean
  }
  loadError?: string | null
}

const DIFFICULTY_OPTIONS = [
  { value: null, label: 'Tümü' },
  { value: 1, label: 'Kolay' },
  { value: 2, label: 'Orta' },
  { value: 3, label: 'Zor' },
  { value: 4, label: 'Çok Zor' },
  { value: 5, label: 'Uzman' },
] as const

const EXAM_REF_OPTIONS = [
  { value: null, label: 'Tümü' },
  { value: 'TYT', label: 'TYT (Lise)' },
  { value: 'LGS', label: 'LGS (8. Sınıf)' },
  { value: 'AYT-SAY', label: 'AYT Sayısal' },
  { value: 'AYT-EA', label: 'AYT Eşit Ağırlık' },
  { value: 'AYT-SOZ', label: 'AYT Sözel' },
] as const

const PRIMARY_MODE_IDS = new Set(['classic', 'deneme', 'practice'])

export function Lobby({
  game,
  selectedMode,
  onSelectMode,
  onStart,
  onLimitReached,
  userXP = 0,
  userStreak = 0,
  selectedCategory,
  onSelectCategory,
  selectedDifficulty,
  onSelectDifficulty,
  selectedExamRef,
  onSelectExamRef,
  quizLimit,
  loadError,
}: LobbyProps) {
  const gameDef = GAMES[game]
  const level = getLevelFromXP(userXP)
  const mode = MODES.find((candidate) => candidate.id === selectedMode) || MODES[0]
  const [showAllModes, setShowAllModes] = useState(!PRIMARY_MODE_IDS.has(selectedMode))
  const [showFilters, setShowFilters] = useState(
    selectedCategory !== null || selectedDifficulty !== null || selectedExamRef !== null
  )

  const examLabel = EXAM_REF_OPTIONS.find((option) => option.value === selectedExamRef)?.label ?? 'Tümü'
  const difficultyLabel = DIFFICULTY_OPTIONS.find((option) => option.value === selectedDifficulty)?.label ?? 'Tümü'
  const categoryLabel = selectedCategory ? getCategoryLabel(selectedCategory) : 'Tüm konular'
  const denemeConfig = DENEME_CONFIGS[game]
  const durationMinutes = mode.isDeneme && denemeConfig
    ? Math.ceil(denemeConfig.totalTime / 60)
    : mode.timePerQuestion > 0
      ? Math.max(1, Math.ceil((mode.questionCount * mode.timePerQuestion) / 60))
      : null

  const filterButtonClass = (active: boolean) =>
    `min-h-11 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
      active
        ? 'text-white shadow-sm'
        : 'bg-[var(--surface)] text-[var(--text-sub)] hover:bg-[var(--border)]'
    }`

  return (
    <div className="mx-auto flex max-w-2xl animate-scaleIn flex-col gap-4 p-4 pb-6 md:gap-5 md:p-6 lg:max-w-3xl lg:p-8">
      <header className="text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Hızlı başlangıç
        </p>
        <h1 className="font-display text-3xl font-black md:text-4xl" style={{ color: gameDef.colorHex }}>
          {gameDef.name}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-sub)] md:text-base">
          {gameDef.description}
        </p>
      </header>

      <div className="animate-fadeUp rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[2.5px] text-xl md:h-12 md:w-12"
            style={{
              background: `linear-gradient(135deg, ${gameDef.colorHex}44, ${gameDef.colorHex})`,
              borderColor: `${gameDef.colorHex}55`,
            }}
            aria-hidden="true"
          >
            {level.badge}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold md:text-base">{level.name}</div>
            <div className="text-xs text-[var(--text-sub)]">{userXP.toLocaleString('tr-TR')} XP</div>
          </div>
          <div className="flex-1" />
          <SoundToggle />
          <StreakBadge streak={userStreak} />
        </div>
        <div className="mt-3">
          <XPBar
            xp={userXP - level.minXP}
            level={level.level}
            max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
          />
        </div>
      </div>

      <section
        aria-labelledby="mode-selection-title"
        className="animate-fadeUp rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 md:p-4"
        style={{ animationDelay: '0.25s', animationFillMode: 'both' }}
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="mode-selection-title" className="text-sm font-extrabold text-[var(--text)] md:text-base">
              Nasıl oynamak istersin?
            </h2>
            <p className="mt-1 text-xs text-[var(--text-sub)]">En çok kullanılan üç mod önde.</p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--focus-bg)] px-2.5 py-1 text-xs font-bold text-[var(--focus-text)]">
            {mode.name}
          </span>
        </div>
        <ModeSelector
          selectedMode={selectedMode}
          onSelect={onSelectMode}
          showAll={showAllModes}
          onShowAllChange={setShowAllModes}
        />
      </section>

      {!mode.isDeneme && (
        <section className="animate-fadeUp rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-controls="quiz-filters"
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
          >
            <SlidersHorizontal size={19} className="shrink-0 text-[var(--focus-text)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--text)]">Soru ayarları</span>
              <span className="mt-0.5 block truncate text-xs text-[var(--text-sub)]">
                {game !== 'wordquest' ? `${examLabel} · ` : ''}{categoryLabel} · {difficultyLabel}
              </span>
            </span>
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showFilters && (
            <div id="quiz-filters" className="flex flex-col gap-5 border-t border-[var(--border)] px-4 py-4">
              {game !== 'wordquest' && (
                <div role="group" aria-labelledby="exam-filter-title">
                  <h3 id="exam-filter-title" className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--text-sub)]">
                    Sınav
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {EXAM_REF_OPTIONS.map((option) => {
                      const active = selectedExamRef === option.value
                      return (
                        <button
                          type="button"
                          key={option.label}
                          onClick={() => onSelectExamRef(option.value)}
                          aria-pressed={active}
                          className={filterButtonClass(active)}
                          style={active ? { backgroundColor: gameDef.colorHex } : undefined}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div role="group" aria-labelledby="category-filter-title">
                <h3 id="category-filter-title" className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--text-sub)]">
                  Konu
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectCategory(null)}
                    aria-pressed={selectedCategory === null}
                    className={filterButtonClass(selectedCategory === null)}
                    style={selectedCategory === null ? { backgroundColor: gameDef.colorHex } : undefined}
                  >
                    Tümü
                  </button>
                  {gameDef.categories.map((category) => {
                    const active = selectedCategory === category
                    return (
                      <button
                        type="button"
                        key={category}
                        onClick={() => onSelectCategory(category)}
                        aria-pressed={active}
                        className={filterButtonClass(active)}
                        style={active ? { backgroundColor: gameDef.colorHex } : undefined}
                      >
                        {getCategoryLabel(category)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div role="group" aria-labelledby="difficulty-filter-title">
                <h3 id="difficulty-filter-title" className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--text-sub)]">
                  Zorluk
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTY_OPTIONS.map((option) => {
                    const active = selectedDifficulty === option.value
                    return (
                      <button
                        type="button"
                        key={option.label}
                        onClick={() => onSelectDifficulty(option.value)}
                        aria-pressed={active}
                        className={filterButtonClass(active)}
                        style={active ? { backgroundColor: gameDef.colorHex } : undefined}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {mode.isDeneme && denemeConfig && (
        <section className="animate-fadeUp rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-[var(--text)]">Deneme formatı</h2>
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--focus-text)]">
              <Clock3 size={15} />
              {Math.ceil(denemeConfig.totalTime / 60)} dakika
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(denemeConfig.questionDistribution).map(([category, count]) => (
              <div key={category} className="flex min-h-10 items-center justify-between rounded-xl bg-[var(--card-bg)] px-3 text-xs">
                <span className="text-[var(--text-sub)]">{getCategoryLabel(category)}</span>
                <span className="font-bold text-[var(--text)]">{count} soru</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--text-sub)]">
            TYT formatında · Net hesabı: Doğru − (Yanlış / 4)
          </p>
        </section>
      )}

      {quizLimit && (
        <div className="animate-fadeUp" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
          <QuizLimitBanner
            remaining={quizLimit.remaining}
            isPremium={quizLimit.isPremium}
            isGuest={quizLimit.isGuest}
          />
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="animate-fadeUp rounded-xl border px-4 py-3 text-sm font-medium"
          style={{
            background: 'var(--urgency-bg, #7f1d1d20)',
            borderColor: 'var(--urgency, #ef4444)',
            color: 'var(--urgency-text, #ef4444)',
          }}
        >
          ⚠️ {loadError}
        </div>
      )}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-2 shadow-2xl backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <div className="flex items-center justify-between gap-3 px-2 pb-2 text-xs text-[var(--text-sub)]">
          <span className="font-semibold text-[var(--text)]">{mode.name}</span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={14} />
            {durationMinutes ? `Yaklaşık ${durationMinutes} dk` : 'Zamansız'}
          </span>
        </div>
        <button
          type="button"
          onClick={quizLimit && !quizLimit.canPlay ? onLimitReached : onStart}
          disabled={Boolean(quizLimit && !quizLimit.canPlay && !onLimitReached)}
          className={`min-h-12 w-full rounded-xl px-4 py-3 font-display text-sm font-bold tracking-wide shadow-lg transition-transform md:text-base ${
            quizLimit && !quizLimit.canPlay
              ? onLimitReached
                ? 'border border-[var(--reward-border)] bg-[var(--reward-bg)] text-[var(--reward-text)] hover:bg-[color-mix(in_srgb,var(--reward)_18%,var(--card-bg))]'
                : 'cursor-not-allowed bg-[var(--surface)] text-[var(--text-muted)] opacity-60'
              : 'btn-primary hover:scale-[1.01]'
          }`}
        >
          {quizLimit && !quizLimit.canPlay
            ? 'Limit doldu · Premium’a geç'
            : `${mode.icon} ${mode.name} Başlat · ${mode.questionCount} Soru`}
        </button>
      </div>

      <AdBanner slot="lobby" className="mx-auto mt-1" />
    </div>
  )
}

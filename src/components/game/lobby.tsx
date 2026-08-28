'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  BookOpenText,
  Calculator,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock3,
  Flame,
  FlaskConical,
  Globe2,
  Languages,
  Play,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { GAMES, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { MODES, type QuizMode, DENEME_CONFIGS } from '@/lib/constants/modes'
import { ModeSelector } from './mode-selector'
import { SoundToggle } from './sound-toggle'
import { XPBar } from './xp-bar'
import { getLevelFromXP } from '@/lib/constants/levels'
import { QuizLimitBanner } from '@/components/premium/quiz-limit-banner'
import { AdBanner } from '@/components/ads/ad-banner'
import { BilgeChan } from '@/components/ui/bilge-chan'
import { MobileLobbyFlow } from './mobile-lobby-flow'

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
  personalizedMockCard?: ReactNode
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

const GAME_ICONS: Record<GameSlug, LucideIcon> = {
  matematik: Calculator,
  turkce: BookOpenText,
  fen: FlaskConical,
  sosyal: Globe2,
  wordquest: Languages,
}

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
  personalizedMockCard,
}: LobbyProps) {
  const gameDef = GAMES[game]
  const GameIcon = GAME_ICONS[game]
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
    `min-h-11 rounded-xl border-2 px-3 py-2 text-xs font-extrabold transition-all active:translate-y-0.5 ${
      active
        ? 'border-transparent text-white shadow-[0_3px_0_rgba(15,23,42,.14)]'
        : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-sub)] shadow-[0_2px_0_var(--app-border)] hover:border-[var(--app-shadow-accent)]'
    }`

  return (
    <div data-responsive-game-lobby className="mx-auto grid min-h-[100dvh] w-full max-w-[1180px] animate-scaleIn grid-cols-1 gap-3 bg-[var(--app-bg)] p-3 pb-28 text-[var(--app-text)] md:grid-cols-[minmax(0,1fr)_300px] md:gap-5 md:p-5 lg:min-h-[calc(100dvh-var(--navbar-h))] lg:grid-cols-[minmax(0,1fr)_340px] lg:bg-transparent lg:pb-6 xl:px-6">
      <div className="-mx-3 -mt-3 flex h-14 items-center gap-1 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)] px-2 md:col-span-2 md:mx-0 md:mt-0 md:rounded-[22px] md:border-2 md:border-[var(--app-border)] md:px-3 md:shadow-[0_4px_0_var(--app-shadow)]">
        <Link href="/arena" aria-label="Arenaya dön" className="flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--app-text-sub)] active:bg-[var(--app-hover)]">
          <ChevronLeft size={23} strokeWidth={3} aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]">
            <GameIcon size={18} strokeWidth={2.8} aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-black text-[var(--app-text)]">{gameDef.name}</span>
        </div>
        <div className="flex items-center gap-2.5 pr-1 text-xs font-black">
          <span aria-label={`${userStreak} günlük seri`} className="flex items-center gap-1 text-[var(--app-warn)]"><Flame size={18} fill="currentColor" />{userStreak}</span>
          <span aria-label={`${userXP} toplam XP`} className="flex items-center gap-1 text-[var(--wisdom-text)]"><Sparkles size={18} fill="currentColor" />{userXP}</span>
          <SoundToggle />
        </div>
      </div>

      {personalizedMockCard && (
        <div data-personalized-mock-mobile-slot className="md:hidden">
          {personalizedMockCard}
        </div>
      )}

      <MobileLobbyFlow
        game={game}
        selectedMode={selectedMode}
        onSelectMode={onSelectMode}
        selectedCategory={selectedCategory}
        onSelectCategory={onSelectCategory}
        selectedDifficulty={selectedDifficulty}
        onSelectDifficulty={onSelectDifficulty}
        selectedExamRef={selectedExamRef}
        onStart={onStart}
        onLimitReached={onLimitReached}
        quizLimit={quizLimit}
        loadError={loadError}
      />

      <header data-desktop-lobby-hero className="relative hidden overflow-hidden rounded-[24px] p-4 text-white md:col-start-1 md:row-start-2 md:block md:min-h-[166px] md:p-6" style={{ background: `linear-gradient(135deg, ${gameDef.colorHex}, ${gameDef.colorHex}cc)`, boxShadow: `0 6px 0 ${gameDef.colorHex}99` }}>
        <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full border-[22px] border-white/10" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white/15 ring-2 ring-white/25">
            <GameIcon size={29} strokeWidth={2.8} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/75">{gameDef.name} yolu</p>
            <h1 className="mt-0.5 text-2xl font-black leading-tight md:text-3xl">{mode.name} turu</h1>
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-white/80">{gameDef.description}</p>
          </div>
          <span className="shrink-0 rounded-xl bg-black/15 px-2.5 py-1.5 text-[10px] font-black">{durationMinutes ? `${durationMinutes} dk` : 'Zamansız'}</span>
        </div>
      </header>

      <div className="relative hidden min-h-[142px] animate-fadeUp overflow-hidden rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-shadow)] md:col-start-2 md:row-start-2 md:block md:min-h-[166px]" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
        <div className="relative z-10 max-w-[66%]">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--app-accent-text)]">Bilge Çan</p>
          <h2 className="mt-1 text-lg font-black leading-6 text-[var(--app-text)]">Turun hazır!</h2>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-[var(--app-text-sub)]">{mode.questionCount} soruda ritmini bul, serini koru ve XP kazan.</p>
          <div className="mt-3">
            <XPBar
              xp={userXP - level.minXP}
              level={level.level}
              max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
            />
          </div>
        </div>
        <div className="absolute right-3 top-3 z-10 rounded-xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--app-text-sub)] shadow-[0_3px_0_var(--app-border)]">{level.badge} {level.name}</div>
        <BilgeChan pose="wave" height={122} priority className="absolute -bottom-8 right-5 drop-shadow-[0_7px_8px_rgba(31,41,55,.14)]" />
      </div>

      <section
        aria-labelledby="mode-selection-title"
        className="hidden animate-fadeUp rounded-[22px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-3 shadow-[0_5px_0_var(--app-shadow-accent)] md:col-start-1 md:row-start-3 md:block md:p-4"
        style={{ animationDelay: '0.25s', animationFillMode: 'both' }}
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Oyun modu</p>
            <h2 id="mode-selection-title" className="mt-0.5 text-[15px] font-black text-[var(--app-text)] md:text-base">
              Nasıl oynamak istersin?
            </h2>
            <p className="mt-1 text-[11px] font-semibold text-[var(--app-text-muted)]">Sana uygun tempoyu seç.</p>
          </div>
          <span className="shrink-0 rounded-xl bg-[var(--app-accent-tint)] px-2.5 py-1.5 text-[11px] font-black text-[var(--app-accent-text)]">
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
        <section className="hidden animate-fadeUp rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_4px_0_var(--app-shadow)] md:col-start-1 md:row-start-4 md:block" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-controls="quiz-filters"
            className="flex min-h-14 w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors hover:bg-[var(--app-hover)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]"><SlidersHorizontal size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-[var(--app-text)]">Soru ayarları</span>
              <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--app-text-muted)]">
                {game !== 'wordquest' ? `${examLabel} · ` : ''}{categoryLabel} · {difficultyLabel}
              </span>
            </span>
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showFilters && (
            <div id="quiz-filters" className="flex flex-col gap-5 border-t-2 border-[var(--app-hover)] px-4 py-4">
              {game !== 'wordquest' && (
                <div role="group" aria-labelledby="exam-filter-title">
                  <h3 id="exam-filter-title" className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--app-text-sub)]">
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
                <h3 id="category-filter-title" className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--app-text-sub)]">
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
                <h3 id="difficulty-filter-title" className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--app-text-sub)]">
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
        <section className="hidden animate-fadeUp rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-shadow)] md:col-start-1 md:row-start-4 md:block" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-[var(--app-text)]">Deneme formatı</h2>
            <span className="flex items-center gap-1.5 text-xs font-black text-[var(--app-accent-text)]">
              <Clock3 size={15} />
              {Math.ceil(denemeConfig.totalTime / 60)} dakika
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(denemeConfig.questionDistribution).map(([category, count]) => (
              <div key={category} className="flex min-h-10 items-center justify-between rounded-xl bg-[var(--app-bg)] px-3 text-xs">
                <span className="text-[var(--app-text-sub)]">{getCategoryLabel(category)}</span>
                <span className="font-bold text-[var(--app-text)]">{count} soru</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-[var(--app-border)] pt-3 text-xs leading-relaxed text-[var(--app-text-sub)]">
            TYT formatında · Net hesabı: Doğru − (Yanlış / 4)
          </p>
        </section>
      )}

      {quizLimit && (
        <div className={`hidden animate-fadeUp md:col-start-2 md:block ${personalizedMockCard ? 'md:row-start-5' : 'md:row-start-4'}`} style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
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
          className={`hidden animate-fadeUp rounded-xl border px-4 py-3 text-sm font-medium md:col-start-2 md:block ${personalizedMockCard ? 'md:row-start-6' : 'md:row-start-5'}`}
          style={{
            background: 'var(--urgency-bg, var(--app-danger-strong)20)',
            borderColor: 'var(--urgency, var(--app-danger))',
            color: 'var(--urgency-text, var(--app-danger))',
          }}
        >
          ⚠️ {loadError}
        </div>
      )}

      <div data-desktop-lobby-start className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 hidden rounded-[20px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)]/95 p-2 shadow-[0_5px_0_var(--app-shadow-accent)] backdrop-blur-xl md:static md:col-start-2 md:row-start-3 md:mx-0 md:block md:self-start">
        <div className="flex items-center justify-between gap-3 px-2 pb-2 text-[11px] font-bold text-[var(--app-text-sub)]">
          <span className="font-black text-[var(--app-text)]">{mode.name}</span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={14} />
            {durationMinutes ? `Yaklaşık ${durationMinutes} dk` : 'Zamansız'}
          </span>
        </div>
        <button
          type="button"
          onClick={quizLimit && !quizLimit.canPlay ? onLimitReached : onStart}
          disabled={Boolean(quizLimit && !quizLimit.canPlay && !onLimitReached)}
          className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black tracking-wide transition-all active:translate-y-1 active:shadow-none md:text-base ${
            quizLimit && !quizLimit.canPlay
              ? onLimitReached
                ? 'border border-[var(--reward-border)] bg-[var(--reward-bg)] text-[var(--reward-text)] hover:bg-[color-mix(in_srgb,var(--reward)_18%,var(--card-bg))]'
                : 'cursor-not-allowed bg-[var(--surface)] text-[var(--text-muted)] opacity-60'
              : 'bg-[var(--app-accent)] text-white shadow-[0_5px_0_var(--app-accent-strong)] hover:bg-[var(--app-accent-strong)]'
          }`}
        >
          {quizLimit && !quizLimit.canPlay
            ? 'Limit doldu · Premium’a geç'
            : <><Play size={18} fill="currentColor" aria-hidden="true" />{mode.name} Başlat · {mode.questionCount} Soru</>}
        </button>
      </div>

      {personalizedMockCard && (
        <div
          data-personalized-mock-slot
          className="hidden animate-fadeUp md:col-start-2 md:row-start-4 md:block md:self-start"
          style={{ animationDelay: '0.35s', animationFillMode: 'both' }}
        >
          {personalizedMockCard}
        </div>
      )}

      <AdBanner slot="lobby" className="mx-auto mt-1 hidden md:col-span-2 md:block" />
    </div>
  )
}

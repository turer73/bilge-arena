'use client'

import { useState } from 'react'
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
        : 'border-[#e5e7eb] bg-white text-[#69717a] shadow-[0_2px_0_#e5e7eb] hover:border-[#bfdbfe]'
    }`

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--navbar-h))] max-w-[520px] animate-scaleIn flex-col gap-3 bg-[#f7f8fa] p-3 pb-28 text-[#45494e] md:my-6 md:min-h-0 md:gap-4 md:rounded-[32px] md:border-2 md:border-[#e5e7eb] md:p-5 md:pb-6 md:shadow-[0_8px_0_#dfe3e7]">
      <div className="-mx-3 -mt-3 flex h-14 items-center gap-1 border-b-2 border-[#eceff2] bg-white px-2">
        <Link href="/arena" aria-label="Arenaya dön" className="flex h-11 w-11 items-center justify-center rounded-2xl text-[#69717a] active:bg-[#eef1f4]">
          <ChevronLeft size={23} strokeWidth={3} aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-[#eff6ff] text-[#2563eb]">
            <GameIcon size={18} strokeWidth={2.8} aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-black text-[#45494e]">{gameDef.name}</span>
        </div>
        <div className="flex items-center gap-2.5 pr-1 text-xs font-black">
          <span aria-label={`${userStreak} günlük seri`} className="flex items-center gap-1 text-[#f97316]"><Flame size={18} fill="currentColor" />{userStreak}</span>
          <span aria-label={`${userXP} toplam XP`} className="flex items-center gap-1 text-[#8b5cf6]"><Sparkles size={18} fill="currentColor" />{userXP}</span>
          <SoundToggle />
        </div>
      </div>
      <header className="relative overflow-hidden rounded-[24px] p-4 text-white" style={{ background: `linear-gradient(135deg, ${gameDef.colorHex}, ${gameDef.colorHex}cc)`, boxShadow: `0 6px 0 ${gameDef.colorHex}99` }}>
        <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full border-[22px] border-white/10" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white/15 ring-2 ring-white/25">
            <GameIcon size={29} strokeWidth={2.8} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/75">{gameDef.name} yolu</p>
            <h1 className="mt-0.5 text-2xl font-black leading-tight">{mode.name} turu</h1>
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-white/80">{gameDef.description}</p>
          </div>
          <span className="shrink-0 rounded-xl bg-black/15 px-2.5 py-1.5 text-[10px] font-black">{durationMinutes ? `${durationMinutes} dk` : 'Zamansız'}</span>
        </div>
      </header>

      <div className="relative min-h-[142px] animate-fadeUp overflow-hidden rounded-[22px] border-2 border-[#e5e7eb] bg-white p-4 shadow-[0_5px_0_#dfe3e7]" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
        <div className="relative z-10 max-w-[66%]">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#2563eb]">Bilge Çan</p>
          <h2 className="mt-1 text-lg font-black leading-6 text-[#3f4449]">Turun hazır!</h2>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-[#7d858d]">{mode.questionCount} soruda ritmini bul, serini koru ve XP kazan.</p>
          <div className="mt-3">
            <XPBar
              xp={userXP - level.minXP}
              level={level.level}
              max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
            />
          </div>
        </div>
        <div className="absolute right-3 top-3 z-10 rounded-xl border-2 border-[#e5e7eb] bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#5d646b] shadow-[0_3px_0_#e5e7eb]">{level.badge} {level.name}</div>
        <BilgeChan pose="wave" height={122} priority className="absolute -bottom-8 right-5 drop-shadow-[0_7px_8px_rgba(31,41,55,.14)]" />
      </div>

      <section
        aria-labelledby="mode-selection-title"
        className="animate-fadeUp rounded-[22px] border-2 border-[#dbeafe] bg-white p-3 shadow-[0_5px_0_#bfdbfe] md:p-4"
        style={{ animationDelay: '0.25s', animationFillMode: 'both' }}
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#2563eb]">Oyun modu</p>
            <h2 id="mode-selection-title" className="mt-0.5 text-[15px] font-black text-[#45494e] md:text-base">
              Nasıl oynamak istersin?
            </h2>
            <p className="mt-1 text-[11px] font-semibold text-[#8b949e]">Sana uygun tempoyu seç.</p>
          </div>
          <span className="shrink-0 rounded-xl bg-[#eff6ff] px-2.5 py-1.5 text-[11px] font-black text-[#2563eb]">
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
        <section className="animate-fadeUp rounded-[20px] border-2 border-[#e5e7eb] bg-white shadow-[0_4px_0_#dfe3e7]" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-controls="quiz-filters"
            className="flex min-h-14 w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors hover:bg-[#f8fafc]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]"><SlidersHorizontal size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-[#45494e]">Soru ayarları</span>
              <span className="mt-0.5 block truncate text-[11px] font-semibold text-[#8b949e]">
                {game !== 'wordquest' ? `${examLabel} · ` : ''}{categoryLabel} · {difficultyLabel}
              </span>
            </span>
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showFilters && (
            <div id="quiz-filters" className="flex flex-col gap-5 border-t-2 border-[#eef1f4] px-4 py-4">
              {game !== 'wordquest' && (
                <div role="group" aria-labelledby="exam-filter-title">
                  <h3 id="exam-filter-title" className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#69717a]">
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
                <h3 id="category-filter-title" className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#69717a]">
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
                <h3 id="difficulty-filter-title" className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#69717a]">
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
        <section className="animate-fadeUp rounded-[20px] border-2 border-[#e5e7eb] bg-white p-4 shadow-[0_4px_0_#dfe3e7]" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-[#45494e]">Deneme formatı</h2>
            <span className="flex items-center gap-1.5 text-xs font-black text-[#2563eb]">
              <Clock3 size={15} />
              {Math.ceil(denemeConfig.totalTime / 60)} dakika
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(denemeConfig.questionDistribution).map(([category, count]) => (
              <div key={category} className="flex min-h-10 items-center justify-between rounded-xl bg-[#f7f8fa] px-3 text-xs">
                <span className="text-[#69717a]">{getCategoryLabel(category)}</span>
                <span className="font-bold text-[#45494e]">{count} soru</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-[#e5e7eb] pt-3 text-xs leading-relaxed text-[#69717a]">
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

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-[20px] border-2 border-[#dbeafe] bg-white/95 p-2 shadow-[0_5px_0_#bfdbfe] backdrop-blur-xl md:static md:mx-0">
        <div className="flex items-center justify-between gap-3 px-2 pb-2 text-[11px] font-bold text-[#7d858d]">
          <span className="font-black text-[#45494e]">{mode.name}</span>
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
              : 'bg-[#2563eb] text-white shadow-[0_5px_0_#1d4ed8] hover:bg-[#1d4ed8]'
          }`}
        >
          {quizLimit && !quizLimit.canPlay
            ? 'Limit doldu · Premium’a geç'
            : <><Play size={18} fill="currentColor" aria-hidden="true" />{mode.name} Başlat · {mode.questionCount} Soru</>}
        </button>
      </div>

      <AdBanner slot="lobby" className="mx-auto mt-1" />
    </div>
  )
}

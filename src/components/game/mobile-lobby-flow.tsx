'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Play, X } from 'lucide-react'
import { GAMES, getCategoriesForExam, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { getModesForContext, type QuizMode } from '@/lib/constants/modes'
import { isTytSocialV2ClientEnabled } from '@/lib/feature-flags/tyt-social-v2-client'

interface MobileLobbyFlowProps {
  game: GameSlug
  selectedMode: string
  onSelectMode: (mode: QuizMode) => void
  selectedCategory: string | null
  onSelectCategory: (category: string | null) => void
  selectedDifficulty: number | null
  onSelectDifficulty: (difficulty: number | null) => void
  selectedExamRef: string | null
  onSelectExamRef: (examRef: string | null) => void
  loadError?: string | null
  onStart: () => void
  startBlocked?: boolean
  startBlockedLabel?: string
  startHref?: string
  startLabel?: string
  onLimitReached?: () => void
  quizLimit?: {
    canPlay: boolean
    remaining: number
    isPremium: boolean
    isGuest: boolean
  }
}

type OptionSheet = 'scope' | 'topic' | 'difficulty' | 'modes' | null

const EXAM_SCOPE_LABELS: Record<string, string> = {
  TYT: 'TYT',
  LGS: 'LGS',
  'AYT-SAY': 'AYT Sayısal',
  'AYT-EA': 'AYT Eşit Ağırlık',
  'AYT-SOZ': 'AYT Sözel',
  YDT: 'YDT',
}

const DIFFICULTIES = [
  { value: null, label: 'Karma', description: 'Seviyeler dengeli karışır' },
  { value: 1, label: 'Kolay', description: 'Temeli sağlamlaştır' },
  { value: 2, label: 'Orta', description: 'Dengeli ilerle' },
  { value: 3, label: 'Zor', description: 'Kendini zorla' },
  { value: 4, label: 'Çok Zor', description: 'İleri seviye' },
  { value: 5, label: 'Uzman', description: 'En güçlü sorular' },
] as const

const PRIMARY_MODE_IDS = ['classic', 'deneme', 'practice'] as const
const EXTRA_MODE_IDS = ['blitz', 'marathon', 'boss'] as const

const PRIMARY_MODE_COPY: Record<string, { label: string; description: string }> = {
  classic: { label: 'Hızlı', description: '10 soru' },
  deneme: { label: 'Deneme', description: '40 soru' },
  practice: { label: 'Pratik', description: 'Zamansız' },
}

const SHEET_TITLES: Record<Exclude<OptionSheet, null>, string> = {
  scope: 'Sınav kapsamını seç',
  topic: 'Konu seç',
  difficulty: 'Zorluk',
  modes: 'Diğer oyun modları',
}

const SHEET_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function optionClass(active: boolean) {
  return `min-h-[64px] rounded-2xl border-2 p-3 text-left transition-transform active:scale-[.98] ${
    active
      ? 'border-[var(--app-accent)] bg-[var(--app-accent-tint)] shadow-[0_4px_0_var(--app-shadow-accent)]'
      : 'border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_3px_0_var(--app-shadow)]'
  }`
}

interface SettingRowProps {
  label: string
  value: string
  onClick: (trigger: HTMLButtonElement) => void
}

function SettingRow({ label, value, onClick }: SettingRowProps) {
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      aria-haspopup="dialog"
      aria-label={`${label} seç: ${value}`}
      className="flex min-h-[54px] w-full items-center gap-3 border-b border-[var(--app-border-soft)] px-3 text-left last:border-b-0 active:bg-[var(--app-hover)]"
    >
      <span className="w-16 shrink-0 text-[11px] font-bold text-[var(--app-text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-black text-[var(--app-text)]">{value}</span>
      <ChevronRight size={18} strokeWidth={2.7} className="shrink-0 text-[var(--app-text-muted)]" aria-hidden="true" />
    </button>
  )
}

export function MobileLobbyFlow({
  game,
  selectedMode,
  onSelectMode,
  selectedCategory,
  onSelectCategory,
  selectedDifficulty,
  onSelectDifficulty,
  selectedExamRef,
  onSelectExamRef,
  loadError,
  onStart,
  startBlocked = false,
  startBlockedLabel = 'Başlatılamıyor',
  startHref,
  startLabel,
  onLimitReached,
  quizLimit,
}: MobileLobbyFlowProps) {
  const gameDef = GAMES[game]
  const categories = getCategoriesForExam(game, selectedExamRef)
  const effectiveExamRef = game === 'sosyal' && isTytSocialV2ClientEnabled()
    ? selectedExamRef ?? 'TYT'
    : selectedExamRef
  const modes = getModesForContext(
    game,
    effectiveExamRef,
    isTytSocialV2ClientEnabled(),
  )
  const mode = modes.find((candidate) => candidate.id === selectedMode) ?? modes[0]
  const selectedCategoryIsValid = selectedCategory === null || categories.includes(selectedCategory)
  const safeCategory = selectedCategoryIsValid ? selectedCategory : null
  const difficulty = DIFFICULTIES.find((item) => item.value === selectedDifficulty) ?? DIFFICULTIES[0]
  const [sheet, setSheet] = useState<OptionSheet>(null)
  const sheetDialogRef = useRef<HTMLDivElement>(null)
  const sheetTriggerRef = useRef<HTMLElement | null>(null)

  const startAction = startBlocked
    ? undefined
    : quizLimit && !quizLimit.canPlay
      ? onLimitReached
      : onStart
  const scopeLabel = effectiveExamRef ? (EXAM_SCOPE_LABELS[effectiveExamRef] ?? effectiveExamRef) : 'Sınav seç'
  const categoryLabel = safeCategory ? getCategoryLabel(safeCategory) : 'Tüm konular'
  const isExtraMode = EXTRA_MODE_IDS.includes(mode.id as typeof EXTRA_MODE_IDS[number])

  useEffect(() => {
    if (!selectedCategoryIsValid) onSelectCategory(null)
  }, [onSelectCategory, selectedCategoryIsValid])

  useEffect(() => {
    if (!sheet) return
    const previousOverflow = document.body.style.overflow
    const dialog = sheetDialogRef.current
    const returnFocusTo = sheetTriggerRef.current
    const desktopQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 768px)')
      : null
    const getFocusableElements = () => dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE_SELECTOR))
      : []
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setSheet(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSheet(null)
        return
      }
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)
      if (!firstElement || !lastElement) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      } else if (dialog && !dialog.contains(document.activeElement)) {
        event.preventDefault()
        firstElement.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    desktopQuery?.addEventListener('change', closeAtDesktop)
    getFocusableElements()[0]?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      desktopQuery?.removeEventListener('change', closeAtDesktop)
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
    }
  }, [sheet])

  const openSheet = (nextSheet: Exclude<OptionSheet, null>, trigger: HTMLElement) => {
    sheetTriggerRef.current = trigger
    setSheet(nextSheet)
  }

  const selectMode = (nextMode: QuizMode) => {
    onSelectMode(nextMode)
    setSheet(null)
  }

  return (
    <section
      data-mobile-lobby-flow
      data-testid="mobile-lobby-flow"
      aria-labelledby="mobile-flow-title"
      className="rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-shadow)] md:hidden"
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Oyun</p>
        <h1 id="mobile-flow-title" className="mt-1 text-xl font-black leading-6 text-[var(--app-text)]">Hemen başla</h1>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 rounded-xl border border-[var(--app-danger)] bg-[var(--app-danger-strong)]/10 px-3 py-2 text-xs font-bold text-[var(--app-danger)]">
          {loadError}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Başlangıç türü">
        {PRIMARY_MODE_IDS.map((modeId) => {
          const item = modes.find((candidate) => candidate.id === modeId)
          if (!item) return null
          const active = item.id === selectedMode
          const copy = PRIMARY_MODE_COPY[item.id]
          const description = item.isDeneme ? `${item.questionCount} soru` : copy.description
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelectMode(item)}
              aria-label={`${copy.label}: ${description}`}
              aria-pressed={active}
              className={`relative min-h-[68px] rounded-2xl border-2 px-2 py-2.5 text-center transition-transform active:scale-[.98] ${
                active
                  ? 'border-[var(--app-accent)] bg-[var(--app-accent-tint)] shadow-[0_4px_0_var(--app-shadow-accent)]'
                  : 'border-[var(--app-border)] bg-[var(--app-bg)]'
              }`}
            >
              {active && <Check size={15} strokeWidth={3.5} className="absolute right-1.5 top-1.5 text-[var(--app-accent-text)]" aria-hidden="true" />}
              <span className="block text-sm font-black text-[var(--app-text)]">{copy.label}</span>
              <span className="mt-0.5 block text-[10px] font-bold text-[var(--app-text-muted)]">{description}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={(event) => openSheet('modes', event.currentTarget)}
        aria-haspopup="dialog"
        className={`mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[11px] font-black ${
          isExtraMode
            ? 'bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]'
            : 'text-[var(--app-text-sub)] active:bg-[var(--app-hover)]'
        }`}
      >
        {isExtraMode ? `Seçili: ${mode.name}` : 'Diğer modlar'}
        <ChevronRight size={15} strokeWidth={2.8} aria-hidden="true" />
      </button>

      <div className="mt-3 overflow-hidden rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-bg)]">
        {game !== 'wordquest' && (
          <SettingRow label="Kapsam" value={scopeLabel} onClick={(trigger) => openSheet('scope', trigger)} />
        )}
        {!mode.isDeneme && (
          <>
            <SettingRow label="Konu" value={categoryLabel} onClick={(trigger) => openSheet('topic', trigger)} />
            <SettingRow label="Seviye" value={difficulty.label} onClick={(trigger) => openSheet('difficulty', trigger)} />
          </>
        )}
      </div>

      <div className="mt-4 border-t-2 border-[var(--app-border-soft)] pt-4">
        {startHref && !startBlocked ? (
          <Link
            href={startHref}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
          >
            <Play size={18} fill="currentColor" aria-hidden="true" />
            {startLabel ?? 'Giriş yaparak başla'}
          </Link>
        ) : (
          <button
            type="button"
            onClick={startAction}
            disabled={!startAction}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play size={18} fill="currentColor" aria-hidden="true" />
            {startBlocked
              ? startBlockedLabel
              : startLabel
                ?? (quizLimit && !quizLimit.canPlay
                  ? 'Limit doldu · Premium’a geç'
                  : mode.isDeneme
                    ? `Denemeyi Başlat · ${mode.questionCount} soru`
                    : `Başla · ${mode.questionCount} soru`)}
          </button>
        )}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            aria-label="Seçim penceresini kapat"
            onClick={() => setSheet(null)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
          />
          <div
            ref={sheetDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-option-sheet-title"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-hidden rounded-t-[28px] border-t-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_-12px_40px_rgba(2,6,23,.28)]"
          >
            <div className="flex items-center gap-3 border-b-2 border-[var(--app-border-soft)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Tek seçim</p>
                <h2 id="mobile-option-sheet-title" className="mt-0.5 truncate text-lg font-black text-[var(--app-text)]">{SHEET_TITLES[sheet]}</h2>
              </div>
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => setSheet(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-bg)] text-[var(--app-text-sub)]"
              >
                <X size={20} strokeWidth={2.8} aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[calc(78dvh-4.5rem)] overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {sheet === 'scope' && (
                <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Sınav kapsamı">
                  {gameDef.examTags.map((examRef) => {
                    const active = selectedExamRef === examRef
                    return (
                      <button type="button" key={examRef} onClick={() => { onSelectExamRef(examRef); setSheet(null) }} aria-pressed={active} className={optionClass(active)}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-[var(--app-text)]">{EXAM_SCOPE_LABELS[examRef] ?? examRef}</span>
                          {active && <Check size={17} strokeWidth={3.5} className="text-[var(--app-accent-text)]" aria-hidden="true" />}
                        </span>
                        <span className="mt-1 block text-[10px] font-semibold text-[var(--app-text-sub)]">Bu sınav kapsamı</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {sheet === 'topic' && (
                <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Konu">
                  <button type="button" onClick={() => { onSelectCategory(null); setSheet(null) }} aria-pressed={safeCategory === null} className={optionClass(safeCategory === null)}>
                    <span className="block text-sm font-black text-[var(--app-text)]">Tüm konular</span>
                    <span className="mt-1 block text-[10px] font-semibold text-[var(--app-text-sub)]">Karışık ve dengeli</span>
                  </button>
                  {categories.map((category) => {
                    const active = safeCategory === category
                    return (
                      <button type="button" key={category} onClick={() => { onSelectCategory(category); setSheet(null) }} aria-pressed={active} className={optionClass(active)}>
                        <span className="block text-sm font-black leading-5 text-[var(--app-text)]">{getCategoryLabel(category)}</span>
                        <span className="mt-1 block text-[10px] font-semibold text-[var(--app-text-sub)]">Bu konuya odaklan</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {sheet === 'difficulty' && (
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Seviye">
                  {DIFFICULTIES.map((item) => {
                    const active = item.value === selectedDifficulty
                    return (
                      <button type="button" key={item.label} onClick={() => { onSelectDifficulty(item.value); setSheet(null) }} aria-pressed={active} className={optionClass(active)}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-[var(--app-text)]">{item.label}</span>
                          {active && <Check size={17} strokeWidth={3.5} className="text-[var(--app-accent-text)]" aria-hidden="true" />}
                        </span>
                        <span className="sr-only">{item.description}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {sheet === 'modes' && (
                <div className="grid gap-2.5" role="group" aria-label="Diğer oyun modları">
                  {EXTRA_MODE_IDS.map((modeId) => {
                    const item = modes.find((candidate) => candidate.id === modeId)
                    if (!item) return null
                    const active = item.id === selectedMode
                    return (
                      <button type="button" key={item.id} onClick={() => selectMode(item)} aria-pressed={active} className={optionClass(active)}>
                        <span className="flex items-center gap-3">
                          <span className="text-xl" aria-hidden="true">{item.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-black text-[var(--app-text)]">{item.name}</span>
                            <span className="mt-0.5 block text-[10px] font-semibold text-[var(--app-text-sub)]">{item.description}</span>
                          </span>
                          {active && <Check size={17} strokeWidth={3.5} className="text-[var(--app-accent-text)]" aria-hidden="true" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Clock3, Play } from 'lucide-react'
import { GAMES, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { DENEME_CONFIGS, MODES, type QuizMode } from '@/lib/constants/modes'

interface MobileLobbyFlowProps {
  game: GameSlug
  selectedMode: string
  onSelectMode: (mode: QuizMode) => void
  selectedCategory: string | null
  onSelectCategory: (category: string | null) => void
  selectedDifficulty: number | null
  onSelectDifficulty: (difficulty: number | null) => void
  selectedExamRef: string | null
  loadError?: string | null
  onStart: () => void
  onLimitReached?: () => void
  quizLimit?: {
    canPlay: boolean
    remaining: number
    isPremium: boolean
    isGuest: boolean
  }
}

type FlowStep = 'mode' | 'topic' | 'difficulty' | 'summary'

const DIFFICULTIES = [
  { value: null, label: 'Karma', description: 'Seviyeler karışık gelir' },
  { value: 1, label: 'Kolay', description: 'Temeli sağlamlaştır' },
  { value: 2, label: 'Orta', description: 'Dengeli ilerle' },
  { value: 3, label: 'Zor', description: 'Kendini zorla' },
  { value: 4, label: 'Çok Zor', description: 'İleri seviye' },
  { value: 5, label: 'Uzman', description: 'En güçlü sorular' },
] as const

const STEP_COPY: Record<FlowStep, { eyebrow: string; title: string; description: string }> = {
  mode: {
    eyebrow: 'Oyun biçimi',
    title: 'Nasıl oynamak istersin?',
    description: 'Bugünkü tempona uygun turu seç.',
  },
  topic: {
    eyebrow: 'Konu seçimi',
    title: 'Neye odaklanalım?',
    description: 'Tek konu seçebilir veya karma ilerleyebilirsin.',
  },
  difficulty: {
    eyebrow: 'Zorluk',
    title: 'Hangi seviyede başlayalım?',
    description: 'Kararsızsan Karma en güvenli seçim.',
  },
  summary: {
    eyebrow: 'Son kontrol',
    title: 'Turun hazır',
    description: 'Seçimlerini kontrol et ve oyuna başla.',
  },
}

function optionClass(active: boolean) {
  return `min-h-[68px] rounded-2xl border-2 p-3 text-left transition-transform active:scale-[.98] ${
    active
      ? 'border-[var(--app-accent)] bg-[var(--app-accent-tint)] shadow-[0_4px_0_var(--app-shadow-accent)]'
      : 'border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_3px_0_var(--app-shadow)]'
  }`
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
  loadError,
  onStart,
  onLimitReached,
  quizLimit,
}: MobileLobbyFlowProps) {
  const gameDef = GAMES[game]
  const mode = MODES.find((candidate) => candidate.id === selectedMode) ?? MODES[0]
  const selectedCategoryIsValid = selectedCategory === null || gameDef.categories.includes(selectedCategory)
  // Derin bağlantıdan gelen konu ve önceki bilinçli zorluk seçimi yeniden sorulmaz.
  // Bu karar ilk açılışta sabitlenir; kullanıcının adım içindeki seçimi akışı kaydırmaz.
  const [askTopic] = useState(() => selectedCategory === null || !selectedCategoryIsValid)
  const [askDifficulty] = useState(() => selectedDifficulty === null)
  const [stepIndex, setStepIndex] = useState(0)

  const steps = useMemo<FlowStep[]>(() => {
    if (mode.isDeneme) return ['mode', 'summary']
    return [
      'mode',
      ...(askTopic ? ['topic' as const] : []),
      ...(askDifficulty ? ['difficulty' as const] : []),
      'summary',
    ]
  }, [askDifficulty, askTopic, mode.isDeneme])

  const safeStepIndex = Math.min(stepIndex, steps.length - 1)
  const step = steps[safeStepIndex]
  const copy = STEP_COPY[step]
  const difficulty = DIFFICULTIES.find((item) => item.value === selectedDifficulty) ?? DIFFICULTIES[0]
  const denemeConfig = DENEME_CONFIGS[game]
  const durationMinutes = mode.isDeneme && denemeConfig
    ? Math.ceil(denemeConfig.totalTime / 60)
    : mode.timePerQuestion > 0
      ? Math.max(1, Math.ceil((mode.questionCount * mode.timePerQuestion) / 60))
      : null
  const startAction = quizLimit && !quizLimit.canPlay ? onLimitReached : onStart

  useEffect(() => {
    if (!selectedCategoryIsValid) onSelectCategory(null)
  }, [onSelectCategory, selectedCategoryIsValid])

  // Bir adımın seçenek sayısı değiştiğinde tarayıcı odaktaki Devam düğmesini
  // korumak için sayfayı aşağı kaydırabilir. Her yeni ekran baştan görünür.
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'auto' })
  }, [safeStepIndex])

  return (
    <section
      data-mobile-lobby-flow
      aria-labelledby="mobile-flow-title"
      className="flex min-h-[calc(100dvh-8.75rem)] flex-col rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-shadow)] md:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-label={`${safeStepIndex + 1} / ${steps.length} adım`}>
          {steps.map((item, index) => (
            <span
              key={item}
              aria-hidden="true"
              className={`h-2 rounded-full transition-all ${index === safeStepIndex ? 'w-7 bg-[var(--app-accent)]' : index < safeStepIndex ? 'w-2 bg-[var(--app-success)]' : 'w-2 bg-[var(--app-border)]'}`}
            />
          ))}
        </div>
        <span className="rounded-xl bg-[var(--app-bg)] px-2.5 py-1 text-[10px] font-black text-[var(--app-text-sub)]">
          {safeStepIndex + 1} / {steps.length}
        </span>
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">{copy.eyebrow}</p>
        <h1 id="mobile-flow-title" className="mt-1 text-2xl font-black leading-7 text-[var(--app-text)]">{copy.title}</h1>
        <p className="mt-1.5 text-sm font-semibold leading-5 text-[var(--app-text-sub)]">{copy.description}</p>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 rounded-xl border border-[var(--app-danger)] bg-[var(--app-danger-strong)]/10 px-3 py-2 text-xs font-bold text-[var(--app-danger)]">
          {loadError}
        </p>
      )}

      <div className="mt-5 min-h-0 flex-1" aria-live="polite">
        {step === 'mode' && (
          <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Oyun modu">
            {MODES.map((item) => {
              const active = item.id === selectedMode
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectMode(item)}
                  aria-pressed={active}
                  className={optionClass(active)}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-xl" aria-hidden="true">{item.icon}</span>
                    {active && <Check size={17} strokeWidth={3.5} className="text-[var(--app-accent-text)]" />}
                  </span>
                  <span className="mt-1.5 block text-sm font-black text-[var(--app-text)]">{item.name}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold leading-4 text-[var(--app-text-sub)]">{item.description}</span>
                </button>
              )
            })}
          </div>
        )}

        {step === 'topic' && (
          <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Konu">
            <button type="button" onClick={() => onSelectCategory(null)} aria-pressed={selectedCategory === null} className={optionClass(selectedCategory === null)}>
              <span className="block text-sm font-black text-[var(--app-text)]">Tüm konular</span>
              <span className="mt-1 block text-[10px] font-semibold text-[var(--app-text-sub)]">Karışık ve dengeli</span>
            </button>
            {gameDef.categories.map((category) => {
              const active = selectedCategory === category
              return (
                <button type="button" key={category} onClick={() => onSelectCategory(category)} aria-pressed={active} className={optionClass(active)}>
                  <span className="block text-sm font-black leading-5 text-[var(--app-text)]">{getCategoryLabel(category)}</span>
                  <span className="mt-1 block text-[10px] font-semibold text-[var(--app-text-sub)]">Bu konuya odaklan</span>
                </button>
              )
            })}
          </div>
        )}

        {step === 'difficulty' && (
          <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Zorluk">
            {DIFFICULTIES.map((item) => {
              const active = item.value === selectedDifficulty
              return (
                <button type="button" key={item.label} onClick={() => onSelectDifficulty(item.value)} aria-pressed={active} className={optionClass(active)}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-[var(--app-text)]">{item.label}</span>
                    {active && <Check size={17} strokeWidth={3.5} className="text-[var(--app-accent-text)]" />}
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold text-[var(--app-text-sub)]">{item.description}</span>
                </button>
              )
            })}
          </div>
        )}

        {step === 'summary' && (
          <div className="space-y-3 rounded-[22px] bg-[var(--app-bg)] p-4">
            <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--app-border-soft)] pb-3">
              <span className="text-xs font-bold text-[var(--app-text-sub)]">Ders</span>
              <span className="text-sm font-black text-[var(--app-text)]">{gameDef.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--app-border-soft)] pb-3">
              <span className="text-xs font-bold text-[var(--app-text-sub)]">Oyun biçimi</span>
              <span className="text-sm font-black text-[var(--app-text)]">{mode.name}</span>
            </div>
            {!mode.isDeneme && (
              <>
                <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--app-border-soft)] pb-3">
                  <span className="text-xs font-bold text-[var(--app-text-sub)]">Konu</span>
                  <span className="text-right text-sm font-black text-[var(--app-text)]">{selectedCategory ? getCategoryLabel(selectedCategory) : 'Tüm konular'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--app-border-soft)] pb-3">
                  <span className="text-xs font-bold text-[var(--app-text-sub)]">Zorluk</span>
                  <span className="text-sm font-black text-[var(--app-text)]">{difficulty.label}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--app-text-sub)]">Tur</span>
              <span className="flex items-center gap-1.5 text-sm font-black text-[var(--app-text)]">
                {mode.questionCount} soru
                <span aria-hidden="true">·</span>
                <Clock3 size={15} aria-hidden="true" />
                {durationMinutes ? `${durationMinutes} dk` : 'Zamansız'}
              </span>
            </div>
            {game !== 'wordquest' && selectedExamRef && (
              <p className="pt-1 text-center text-[10px] font-black uppercase tracking-[0.12em] text-[var(--app-accent-text)]">{selectedExamRef} kapsamı</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t-2 border-[var(--app-border-soft)] pt-3">
        {safeStepIndex > 0 ? (
          <button
            type="button"
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            className="flex min-h-[52px] items-center justify-center gap-1 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-4 text-sm font-black text-[var(--app-text-sub)]"
          >
            <ChevronLeft size={19} strokeWidth={3} /> Geri
          </button>
        ) : <span />}

        {step === 'summary' ? (
          <button
            type="button"
            onClick={startAction}
            disabled={!startAction}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play size={18} fill="currentColor" aria-hidden="true" />
            {quizLimit && !quizLimit.canPlay ? 'Limit doldu · Premium’a geç' : 'Turu Başlat'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
          >
            Devam Et <ChevronRight size={19} strokeWidth={3} />
          </button>
        )}
      </div>
    </section>
  )
}

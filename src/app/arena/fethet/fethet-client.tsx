'use client'

import { useEffect, useState, useCallback } from 'react'
import { GAMES, GAME_LIST, getCategoryLabel } from '@/lib/constants/games'
import type { GameSlug } from '@/lib/constants/games'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FethetQuestion {
  id: string
  content: {
    question: string
    options: string[]
    answer: number
    solution?: string
  }
  category: string
  game: string
}

interface ActiveQuiz {
  game: GameSlug
  category: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bilge-arena-fethet-v1'
const QUESTIONS_PER_CATEGORY = 3
const PASS_THRESHOLD = 2   // Kaç doğru = fethedildi

const GAME_EMOJI: Record<string, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

const ALL_CATEGORIES = GAME_LIST.flatMap((g) =>
  g.categories.map((c) => `${g.slug}-${c}`)
)

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadConquered(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveConquered(s: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
  } catch {}
}

// ─── QuizModal ────────────────────────────────────────────────────────────────

interface QuizModalProps {
  game: GameSlug
  category: string
  onClose: () => void
  onResult: (pass: boolean) => void
}

function QuizModal({ game, category, onClose, onResult }: QuizModalProps) {
  const [questions, setQuestions] = useState<FethetQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)
  const [passed, setPassed] = useState(false)

  const gameConfig = GAMES[game]
  const color = gameConfig?.colorHex ?? 'var(--focus)'

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(
      `/api/questions?game=${game}&category=${category}&limit=${QUESTIONS_PER_CATEGORY}&active=true`
    )
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Soru alınamadı')))
      .then((data) => {
        const qs: FethetQuestion[] = (data.questions ?? []).slice(0, QUESTIONS_PER_CATEGORY)
        if (qs.length === 0) {
          setError('Bu kategori için henüz soru eklenmemiş.')
        } else {
          setQuestions(qs)
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [game, category])

  const question = questions[idx]
  const totalQ = questions.length

  function handleSelect(optIdx: number) {
    if (revealed) return
    setSelected(optIdx)
    setRevealed(true)
    if (optIdx === question.content.answer) {
      setCorrectCount((c) => c + 1)
    }
  }

  function handleNext() {
    const nextIdx = idx + 1
    if (nextIdx >= totalQ) {
      // correctCount, handleSelect'ten gelen state (ayrı click event'i = commit edildi)
      const pass = correctCount >= PASS_THRESHOLD
      setPassed(pass)
      setDone(true)
      onResult(pass)
    } else {
      setIdx(nextIdx)
      setSelected(null)
      setRevealed(false)
    }
  }

  // Overlay backdrop
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border bg-[var(--card-bg)] p-5 shadow-2xl md:p-7"
        style={{ borderColor: `${color}40` }}
      >
        {/* Kapat */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--text-muted)] transition-colors hover:text-[var(--text-sub)]"
          aria-label="Kapat"
        >
          ✕
        </button>

        {/* Başlık */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{GAME_EMOJI[game] || '📋'}</span>
            <span className="text-xs font-extrabold tracking-widest text-[var(--text-muted)] uppercase">
              {gameConfig?.name} · {getCategoryLabel(category)}
            </span>
          </div>
        </div>

        {/* Yükleniyor */}
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
          </div>
        )}

        {/* Hata */}
        {!loading && error && (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <span className="text-3xl">😕</span>
            <p className="text-sm text-[var(--text-sub)]">{error}</p>
            <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
              Kapat
            </button>
          </div>
        )}

        {/* Quiz tamamlandı */}
        {!loading && !error && done && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="text-5xl">{passed ? '🏆' : '😅'}</span>
            <h2 className="text-xl font-black" style={{ color: passed ? color : 'var(--urgency)' }}>
              {passed ? 'Fethedildi!' : 'Başarısız'}
            </h2>
            <p className="text-sm text-[var(--text-sub)]">
              {passed
                ? `${getCategoryLabel(category)} kategorisi artık senindir!`
                : 'Tekrar deneyebilirsin. Biraz daha pratik yap!'}
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white"
              style={{ background: passed ? color : 'var(--urgency)' }}
            >
              {passed ? 'Haritaya Dön' : 'Tekrar Dene'}
            </button>
          </div>
        )}

        {/* Aktif quiz */}
        {!loading && !error && !done && question && (
          <>
            {/* İlerleme */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex-1 overflow-hidden rounded-full bg-[var(--bg-secondary)] h-1.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(idx / totalQ) * 100}%`, background: color }}
                />
              </div>
              <span className="shrink-0 text-[10px] font-bold text-[var(--text-muted)]">
                {idx + 1}/{totalQ}
              </span>
            </div>

            {/* Soru */}
            <p className="mb-5 text-sm font-semibold leading-relaxed md:text-base">
              {question.content.question}
            </p>

            {/* Şıklar */}
            <div className="space-y-2">
              {question.content.options.map((opt, i) => {
                let bg = 'var(--bg-secondary)'
                let border = 'var(--border)'
                let textColor = 'var(--text)'

                if (revealed) {
                  if (i === question.content.answer) {
                    bg = 'var(--growth-bg)'
                    border = 'var(--growth-border)'
                    textColor = 'var(--growth)'
                  } else if (i === selected && i !== question.content.answer) {
                    bg = 'var(--urgency-bg, rgba(239,68,68,0.1))'
                    border = 'var(--urgency-border, rgba(239,68,68,0.3))'
                    textColor = 'var(--urgency)'
                  }
                } else if (selected === i) {
                  bg = 'var(--focus-bg)'
                  border = 'var(--focus-border)'
                  textColor = 'var(--focus)'
                }

                const label = ['A', 'B', 'C', 'D'][i]

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    disabled={revealed}
                    className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 disabled:cursor-default"
                    style={{ background: bg, borderColor: border, color: textColor }}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
                      style={{ background: `${border}`, color: textColor }}
                    >
                      {label}
                    </span>
                    <span>{opt}</span>
                  </button>
                )
              })}
            </div>

            {/* İleri butonu (cevap sonrası) */}
            {revealed && (
              <button
                onClick={handleNext}
                className="mt-4 w-full rounded-xl py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: color }}
              >
                {idx + 1 < totalQ ? 'Sonraki Soru →' : 'Sonucu Gör'}
              </button>
            )}

            {/* Çözüm açıklaması */}
            {revealed && question.content.solution && (
              <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[10px] text-[var(--text-sub)]">
                💡 {question.content.solution}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export function FethetClient() {
  const [conquered, setConquered] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<ActiveQuiz | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setConquered(loadConquered())
    setMounted(true)
  }, [])

  const handleResult = useCallback((pass: boolean) => {
    if (!active) return
    if (pass) {
      setConquered((prev) => {
        const next = new Set(prev)
        next.add(`${active.game}-${active.category}`)
        saveConquered(next)
        return next
      })
    }
  }, [active])

  const handleClose = useCallback(() => {
    setActive(null)
  }, [])

  const conqueredCount = conquered.size
  const totalCount = ALL_CATEGORIES.length
  const progress = totalCount > 0 ? (conqueredCount / totalCount) * 100 : 0
  const allDone = conqueredCount >= totalCount

  const handleReset = () => {
    if (!confirm('Tüm ilerlemeniz sıfırlanacak. Emin misiniz?')) return
    const empty = new Set<string>()
    setConquered(empty)
    saveConquered(empty)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8 xl:max-w-4xl">

      {/* ── Başlık ── */}
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-black md:text-3xl xl:text-4xl">
          ⚔️{' '}
          <span className="bg-gradient-to-r from-[var(--focus)] to-[var(--reward)] bg-clip-text text-transparent">
            Bil ve Fethet
          </span>
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-sub)] md:text-sm">
          Her kategoriyi {QUESTIONS_PER_CATEGORY} soruyla fethederek tüm bilgi haritasını ele geçir
        </p>
      </div>

      {/* ── İlerleme ── */}
      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--text-sub)]">
            {allDone ? '🎉 Tüm harita fethedildi!' : `${conqueredCount}/${totalCount} kategori fethedildi`}
          </span>
          <span className="text-[10px] font-bold" style={{ color: 'var(--focus)' }}>
            %{Math.round(progress)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: allDone
                ? 'var(--reward)'
                : 'linear-gradient(to right, var(--focus), var(--wisdom))',
            }}
          />
        </div>
      </div>

      {/* ── Oyun bölümleri ── */}
      <div className="space-y-6">
        {GAME_LIST.map((game) => {
          const slug = game.slug as GameSlug
          const gameConquered = game.categories.filter(
            (c) => conquered.has(`${slug}-${c}`)
          ).length

          return (
            <div key={slug}>
              {/* Oyun başlığı */}
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-base leading-none">{GAME_EMOJI[slug] || '📋'}</span>
                <span
                  className="text-sm font-extrabold"
                  style={{ color: game.colorHex }}
                >
                  {game.name}
                </span>
                <div className="flex-1 border-t border-dashed border-[var(--border)]" />
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                  style={{
                    background:
                      gameConquered === game.categories.length
                        ? 'var(--growth-bg)'
                        : 'var(--bg-secondary)',
                    color:
                      gameConquered === game.categories.length
                        ? 'var(--growth)'
                        : 'var(--text-muted)',
                  }}
                >
                  {gameConquered}/{game.categories.length}
                </span>
              </div>

              {/* Kategori kartları */}
              <div className="flex flex-wrap gap-2">
                {game.categories.map((cat) => {
                  const key = `${slug}-${cat}`
                  const isConquered = mounted && conquered.has(key)
                  const isActive = active?.game === slug && active?.category === cat

                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        if (isConquered) return
                        setActive({ game: slug, category: cat })
                      }}
                      disabled={isConquered}
                      className={`relative flex flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-center text-[11px] font-bold transition-all duration-200 ${
                        isConquered
                          ? 'cursor-default'
                          : 'hover:-translate-y-0.5 hover:shadow-md active:scale-95'
                      } ${isActive ? 'ring-2' : ''}`}
                      style={{
                        background: isConquered
                          ? `color-mix(in srgb, ${game.colorHex} 12%, transparent)`
                          : 'var(--card-bg)',
                        borderColor: isConquered
                          ? `color-mix(in srgb, ${game.colorHex} 40%, transparent)`
                          : 'var(--border)',
                        color: isConquered ? game.colorHex : 'var(--text-sub)',
                        minWidth: '90px',
                      }}
                    >
                      {isConquered ? (
                        <span className="text-base leading-none">⚑</span>
                      ) : (
                        <span className="text-base leading-none opacity-50">🏁</span>
                      )}
                      <span className="leading-tight">{getCategoryLabel(cat)}</span>
                      {!isConquered && (
                        <span
                          className="mt-0.5 rounded-md px-1.5 py-0.5 text-[8px] font-extrabold"
                          style={{
                            background: `color-mix(in srgb, ${game.colorHex} 15%, transparent)`,
                            color: game.colorHex,
                          }}
                        >
                          Fethet
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Sıfırla ── */}
      {mounted && conqueredCount > 0 && (
        <div className="mt-8 text-center">
          <button
            onClick={handleReset}
            className="text-[10px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--urgency)] transition-colors"
          >
            İlerlemeyi sıfırla
          </button>
        </div>
      )}

      {/* ── Quiz Modal ── */}
      {active && (
        <QuizModal
          game={active.game}
          category={active.category}
          onClose={handleClose}
          onResult={handleResult}
        />
      )}
    </div>
  )
}

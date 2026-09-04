'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback, useRef } from 'react'
import { GAMES, GAME_LIST, getCategoryLabel } from '@/lib/constants/games'
import type { GameSlug } from '@/lib/constants/games'
import { renderRichText } from '@/lib/utils/rich-text'
import { shufflePublicOptionsWithMap } from '@/lib/utils/question'
import { gradeQuestion } from '@/lib/questions/grade-question'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { isValidUuid } from '@/lib/utils/uuid'
import { useTytSocialExamPolicy } from '@/lib/hooks/use-tyt-social-exam-policy'
import { getTytSocialAllowedCategories } from '@/lib/exam-policy/tyt-social-contract'
import { isTytSocialV2ClientEnabled } from '@/lib/feature-flags/tyt-social-v2-client'
import { useAuthStore } from '@/stores/auth-store'

// ─── Types ────────────────────────────────────────────────────────────────────

type FethetQuestion = PublicQuestion & {
  optionMap: number[]
}

interface QuestionListResponse {
  questions?: PublicQuestion[]
  attemptId?: unknown
  expiresAt?: unknown
}

interface ActiveQuiz {
  game: GameSlug
  category: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEGACY_STORAGE_KEY = 'bilge-arena-fethet-v1'
const V2_STORAGE_KEY = 'bilge-arena-fethet-v2'
const QUESTIONS_PER_CATEGORY = 3
const PASS_THRESHOLD = 2   // Kaç doğru = fethedildi

const GAME_EMOJI: Record<string, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadConquered(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(storageKey)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveConquered(storageKey: string, s: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...s]))
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
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [correctOption, setCorrectOption] = useState<number | null>(null)
  const [solution, setSolution] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [passed, setPassed] = useState(false)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const gradingRef = useRef(false)

  const gameConfig = GAMES[game]
  const color = gameConfig?.colorHex ?? 'var(--focus)'

  useEffect(() => {
    const governedSocial = isTytSocialV2ClientEnabled() && game === 'sosyal'
    setLoading(true)
    setError(null)
    setAttemptId(null)
    const params = new URLSearchParams({
      game,
      category,
      limit: String(QUESTIONS_PER_CATEGORY),
    })
    const endpoint = governedSocial
      ? (() => {
          params.set('mode', 'classic')
          params.set('examRef', 'TYT')
          return `/api/questions/random?${params.toString()}`
        })()
      : (() => {
          params.set('active', 'true')
          return `/api/questions?${params.toString()}`
        })()

    fetch(endpoint, { cache: 'no-store' })
      .then((r) => {
        if (r.ok) return r.json()
        if (r.status === 409 && governedSocial) {
          throw new Error('Önce Çalış sayfasında TYT Sosyal cevaplama düzenini seçmelisin.')
        }
        throw new Error('Soru alınamadı')
      })
      .then((data: QuestionListResponse) => {
        const nextAttemptId = isValidUuid(data.attemptId)
          && typeof data.expiresAt === 'string'
          && Number.isFinite(Date.parse(data.expiresAt))
          && Date.parse(data.expiresAt) > Date.now()
          ? data.attemptId
          : null
        setAttemptId(nextAttemptId)
        // Display choices are shuffled; the map retains their canonical DB indexes.
        const qs: FethetQuestion[] = (data.questions ?? [])
          .slice(0, QUESTIONS_PER_CATEGORY)
          .map((q: PublicQuestion) => {
            const shuffled = shufflePublicOptionsWithMap(q.content)
            return { ...q, content: shuffled.content, optionMap: shuffled.map }
          })
        if (qs.length < QUESTIONS_PER_CATEGORY) {
          setError(governedSocial
            ? 'Bu kategori seçtiğin TYT Sosyal cevaplama düzeninde güvenilir bir fetih turu için yeterli soruya sahip değil.'
            : 'Bu kategori için güvenilir bir fetih turuna yetecek soru yok.')
        } else {
          setQuestions(qs)
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [game, category])

  const question = questions[idx]
  const totalQ = questions.length

  async function handleSelect(optIdx: number) {
    if (revealed || gradingRef.current || !question) return
    const canonicalIndex = question.optionMap[optIdx]
    if (!Number.isInteger(canonicalIndex)) return

    gradingRef.current = true
    setSelected(optIdx)
    setGrading(true)
    setGradeError(null)
    try {
      const grade = await gradeQuestion(question.id, canonicalIndex, attemptId)
      const displayCorrectOption = question.optionMap.indexOf(grade.correctOption)
      if (displayCorrectOption < 0) throw new Error('invalid_grade_response')

      setCorrectOption(displayCorrectOption)
      setSolution(grade.solution)
      if (grade.isCorrect) setCorrectCount((count) => count + 1)
      setRevealed(true)
    } catch {
      setSelected(null)
      setGradeError('Cevap kontrol edilemedi. Lütfen tekrar dene.')
    } finally {
      gradingRef.current = false
      setGrading(false)
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
      setCorrectOption(null)
      setSolution(null)
      setGradeError(null)
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
            {game === 'sosyal' && (
              <Link
                href="/arena/calisma"
                className="text-xs font-bold text-[var(--focus)] underline underline-offset-2"
              >
                Çalış sayfasına git
              </Link>
            )}
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
              {renderRichText(question.content.question || question.content.sentence || '')}
            </p>

            {/* Şıklar */}
            <div className="space-y-2">
              {question.content.options.map((opt, i) => {
                let bg = 'var(--bg-secondary)'
                let border = 'var(--border)'
                let textColor = 'var(--text)'

                if (revealed) {
                  if (i === correctOption) {
                    bg = 'var(--growth-bg)'
                    border = 'var(--growth-border)'
                    textColor = 'var(--growth)'
                  } else if (i === selected && i !== correctOption) {
                    bg = 'var(--urgency-bg, rgba(239,68,68,0.1))'
                    border = 'var(--urgency-border, rgba(239,68,68,0.3))'
                    textColor = 'var(--urgency)'
                  }
                } else if (selected === i) {
                  bg = 'var(--focus-bg)'
                  border = 'var(--focus-border)'
                  textColor = 'var(--focus)'
                }

                const label = ['A', 'B', 'C', 'D', 'E'][i] ?? String(i + 1)

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    disabled={revealed || grading}
                    className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 disabled:cursor-default"
                    style={{ background: bg, borderColor: border, color: textColor }}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
                      style={{ background: `${border}`, color: textColor }}
                    >
                      {label}
                    </span>
                    <span>{renderRichText(opt)}</span>
                  </button>
                )
              })}
            </div>

            {/* İleri butonu (cevap sonrası) */}
            {grading && (
              <p className="mt-3 text-center text-xs text-[var(--text-sub)]">Kontrol ediliyor...</p>
            )}
            {gradeError && (
              <p className="mt-3 text-center text-xs text-[var(--urgency)]">{gradeError}</p>
            )}

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
            {revealed && solution && (
              <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[10px] text-[var(--text-sub)]">
                💡 {solution}
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
  const { user } = useAuthStore()
  const learnerV2Enabled = isTytSocialV2ClientEnabled()
  const socialPolicy = useTytSocialExamPolicy({ game: 'sosyal', examRef: 'TYT' })
  const governedSocial = learnerV2Enabled && socialPolicy.eligible
  const generalStorageKey = learnerV2Enabled
    ? `${V2_STORAGE_KEY}:${user?.id ? `user:${user.id}` : 'guest'}`
    : LEGACY_STORAGE_KEY
  const socialPolicyKey = socialPolicy.status === 'active'
    && governedSocial
    && user?.id
    && socialPolicy.policyVersion
    && socialPolicy.selectionEffectiveAt
    && socialPolicy.variantCode
    ? `${user.id}:${socialPolicy.policyVersion}:${socialPolicy.selectionEffectiveAt}:${socialPolicy.variantCode}`
    : null
  const socialStorageKey = socialPolicyKey
    ? `${V2_STORAGE_KEY}:social:${socialPolicyKey}`
    : null
  const socialCategories = governedSocial && socialPolicy.status === 'active'
    && socialPolicy.policyVersion
    && socialPolicy.variantCode
    ? getTytSocialAllowedCategories(socialPolicy.policyVersion, socialPolicy.variantCode)
    : []
  const categoriesByGame = new Map(GAME_LIST.map((game) => [
    game.slug,
    game.slug === 'sosyal' && governedSocial ? socialCategories : game.categories,
  ]))
  const allCategories = GAME_LIST.flatMap((game) => (
    (categoriesByGame.get(game.slug) ?? []).map((category) => `${game.slug}-${category}`)
  ))
  const [conquered, setConquered] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<ActiveQuiz | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const allowed = new Set(allCategories)
    const stored = new Set([
      ...(governedSocial
        ? [...loadConquered(generalStorageKey)].filter((category) => !category.startsWith('sosyal-'))
        : loadConquered(generalStorageKey)),
      ...(socialStorageKey ? loadConquered(socialStorageKey) : []),
    ])
    setConquered(new Set(
      [...stored].filter((category) => allowed.has(category)),
    ))
    setMounted(true)
  // allCategories is deterministically derived from the policy key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalStorageKey, socialStorageKey])

  const handleResult = useCallback((pass: boolean) => {
    if (!active) return
    if (pass) {
      setConquered((prev) => {
        const next = new Set(prev)
        next.add(`${active.game}-${active.category}`)
        saveConquered(generalStorageKey, governedSocial
          ? new Set([...next].filter((category) => !category.startsWith('sosyal-')))
          : next)
        if (socialStorageKey) {
          saveConquered(socialStorageKey, new Set(
            [...next].filter((category) => category.startsWith('sosyal-')),
          ))
        }
        return next
      })
    }
  }, [active, generalStorageKey, governedSocial, socialStorageKey])

  const handleClose = useCallback(() => {
    setActive(null)
  }, [])

  const conqueredCount = conquered.size
  const totalCount = allCategories.length
  const progress = totalCount > 0 ? (conqueredCount / totalCount) * 100 : 0
  const allDone = (governedSocial ? socialPolicy.status === 'active' : true)
    && conqueredCount >= totalCount

  const handleReset = () => {
    if (!confirm('Tüm ilerlemeniz sıfırlanacak. Emin misiniz?')) return
    const empty = new Set<string>()
    setConquered(empty)
    saveConquered(generalStorageKey, empty)
    if (socialStorageKey) saveConquered(socialStorageKey, empty)
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
          const visibleCategories = categoriesByGame.get(game.slug) ?? []
          const gameConquered = visibleCategories.filter(
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
                      visibleCategories.length > 0 && gameConquered === visibleCategories.length
                        ? 'var(--growth-bg)'
                        : 'var(--bg-secondary)',
                    color:
                      visibleCategories.length > 0 && gameConquered === visibleCategories.length
                        ? 'var(--growth)'
                        : 'var(--text-muted)',
                  }}
                >
                  {gameConquered}/{visibleCategories.length}
                </span>
              </div>

              {/* Kategori kartları */}
              <div className="flex flex-wrap gap-2">
                {slug === 'sosyal' && governedSocial && socialPolicy.status !== 'active' && (
                  <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3 text-xs text-[var(--text-sub)]">
                    <p className="font-semibold">
                      {socialPolicy.loading
                        ? 'TYT Sosyal cevaplama düzenin kontrol ediliyor…'
                        : 'Sosyal fetih haritası, cevaplama düzenini seçtikten sonra açılır.'}
                    </p>
                    {!socialPolicy.loading && (
                      <Link
                        href="/arena/calisma"
                        className="mt-2 inline-block font-bold text-[var(--focus)] underline underline-offset-2"
                      >
                        Çalış sayfasında düzeni seç
                      </Link>
                    )}
                  </div>
                )}
                {visibleCategories.map((cat) => {
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

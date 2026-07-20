'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, GAME_SLUGS, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { getCorrectIndex } from '@/lib/utils/question'
import { renderRichText } from '@/lib/utils/rich-text'
import { trUpper } from '@/lib/utils/tr-text'
import { OptionButton } from '@/components/game/option-button'
import { SolutionBlock } from '@/components/game/solution-block'
import type { QuestionContent } from '@/types/database'

const GAME_EMOJI: Record<GameSlug, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

type ReviewStatus = 'acik' | 'duzeltildi'

interface WrongAnswerItem {
  questionId: string
  game: GameSlug
  category: string
  subcategory: string | null
  difficulty: number
  content: QuestionContent
  userSelectedOption: number | null
  wrongCount: number
  lastWrongAt: string
  status: ReviewStatus
}

interface WrongAnswersResponse {
  items: WrongAnswerItem[]
  page: number
  limit: number
  hasMore: boolean
}

type GameFilter = GameSlug | 'all'
type StatusFilter = ReviewStatus | 'all'

const STATUS_LABEL: Record<ReviewStatus, string> = {
  acik: 'Açık',
  duzeltildi: 'Düzeltildi',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

async function fetchWrongAnswers(
  game: GameFilter,
  status: StatusFilter,
  page: number,
): Promise<WrongAnswersResponse> {
  const qs = new URLSearchParams()
  if (game !== 'all') qs.set('game', game)
  if (status !== 'all') qs.set('status', status)
  qs.set('page', String(page))

  const res = await fetch(`/api/review/wrong-answers?${qs.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Yanlislar yuklenemedi')
  return (await res.json()) as WrongAnswersResponse
}

export default function YanlislarimClient() {
  const { user, loading: authLoading } = useAuthStore()

  const [gameFilter, setGameFilter] = useState<GameFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [items, setItems] = useState<WrongAnswerItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [everHadAny, setEverHadAny] = useState<boolean | null>(null)

  // Filtre degisince listeyi bastan yukle
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setError(false)

    fetchWrongAnswers(gameFilter, statusFilter, 1)
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setPage(1)
        setHasMore(data.hasMore)
        // Filtresiz ilk yukleme sonucuna gore "hic yanlisi yok" bos-durumunu belirle
        if (gameFilter === 'all' && statusFilter === 'all') {
          setEverHadAny(data.items.length > 0)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, gameFilter, statusFilter])

  const loadMore = useCallback(() => {
    if (loadingMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    fetchWrongAnswers(gameFilter, statusFilter, nextPage)
      .then((data) => {
        setItems((prev) => [...prev, ...data.items])
        setPage(nextPage)
        setHasMore(data.hasMore)
      })
      .catch(() => setError(true))
      .finally(() => setLoadingMore(false))
  }, [gameFilter, statusFilter, page, loadingMore])

  // Yukleniyor (auth store)
  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
      </div>
    )
  }

  // Giris yapilmamis
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="mb-2 text-xl font-bold">Giriş Yapmanız Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">
          Yanlış cevapladığın soruları görmek ve tekrar çalışmak için giriş yap.
        </p>
        <Link
          href="/giris"
          className="btn-primary inline-block rounded-[10px] px-8 py-3 font-display text-sm font-bold tracking-wider"
        >
          Giriş Yap
        </Link>
      </div>
    )
  }

  // Ders bazinda grupla (canonik oyun sirasi) — sadece listede olan dersler gorunur
  const grouped: { game: GameSlug; items: WrongAnswerItem[] }[] = GAME_SLUGS
    .map((g) => ({ game: g, items: items.filter((it) => it.game === g) }))
    .filter((grp) => grp.items.length > 0)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-3xl md:py-8 xl:max-w-4xl xl:px-6 xl:py-10">
      <div className="mb-5 animate-fadeUp">
        <h1 className="text-lg font-bold md:text-2xl">📓 Yanlışlarım</h1>
        <p className="mt-1 text-xs text-[var(--text-sub)] md:text-sm">
          Yanlış cevapladığın sorular burada — tekrar oku, aynı hatayı bir daha yapma.
        </p>
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2 animate-fadeUp" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
        <FilterPill active={gameFilter === 'all'} onClick={() => setGameFilter('all')} label="Tüm Dersler" />
        {GAME_SLUGS.map((g) => (
          <FilterPill
            key={g}
            active={gameFilter === g}
            onClick={() => setGameFilter(g)}
            label={`${GAME_EMOJI[g]} ${GAMES[g].name}`}
          />
        ))}

        <div className="mx-1 h-4 w-px bg-[var(--border)]" />

        <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="Tümü" />
        <FilterPill active={statusFilter === 'acik'} onClick={() => setStatusFilter('acik')} label="Açık" tone="urgency" />
        <FilterPill active={statusFilter === 'duzeltildi'} onClick={() => setStatusFilter('duzeltildi')} label="Düzeltildi" tone="growth" />
      </div>

      {/* Yukleniyor */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
        </div>
      )}

      {/* Hata */}
      {!loading && error && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-8 text-center">
          <div className="mb-2 text-3xl">⚠️</div>
          <p className="text-sm text-[var(--text-sub)]">Yanlışların yüklenemedi. Lütfen sayfayı yenile.</p>
        </div>
      )}

      {/* Hic yanlis yok — tebrik tonu */}
      {!loading && !error && everHadAny === false && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-10 text-center">
          <div className="mb-3 text-4xl">🎉</div>
          <h2 className="mb-1 text-base font-bold">Tertemiz bir sicilin var!</h2>
          <p className="text-sm text-[var(--text-sub)]">
            Henüz hiç yanlış cevabın yok. Böyle devam et — oynadıkça burada tekrar etmen gereken sorular birikecek.
          </p>
        </div>
      )}

      {/* Filtreye gore sonuc yok (ama genel olarak yanlis var) */}
      {!loading && !error && everHadAny === true && items.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-8 text-center">
          <div className="mb-2 text-3xl">✨</div>
          <p className="text-sm text-[var(--text-sub)]">Bu filtreye uyan soru yok.</p>
        </div>
      )}

      {/* Liste — ders bazinda gruplu */}
      {!loading && !error && grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(({ game, items: gameItems }) => (
            <div key={game} className="animate-fadeUp">
              <h3 className="mb-2.5 flex items-center gap-2 text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
                <span
                  className="h-1 w-6 rounded-full"
                  style={{ backgroundColor: GAMES[game].colorHex }}
                />
                {GAME_EMOJI[game]} {trUpper(GAMES[game].name)} ({gameItems.length})
              </h3>
              <div className="space-y-3">
                {gameItems.map((item) => (
                  <WrongAnswerCard key={item.questionId} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daha fazla yukle */}
      {!loading && !error && hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-5 py-2 text-xs font-bold text-[var(--text-sub)] transition-colors hover:border-[var(--focus-border)] hover:text-[var(--focus)] disabled:opacity-50"
          >
            {loadingMore ? 'Yükleniyor…' : 'Daha Fazla Yükle'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Alt komponentler ----------

function FilterPill({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  tone?: 'urgency' | 'growth'
}) {
  const activeColor = tone === 'urgency' ? 'var(--urgency)' : tone === 'growth' ? 'var(--growth)' : 'var(--focus)'
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors"
      style={
        active
          ? {
              borderColor: activeColor,
              color: activeColor,
              background: `color-mix(in srgb, ${activeColor} 12%, transparent)`,
            }
          : {
              borderColor: 'var(--border)',
              color: 'var(--text-sub)',
              background: 'var(--card-bg)',
            }
      }
    >
      {label}
    </button>
  )
}

function WrongAnswerCard({ item }: { item: WrongAnswerItem }) {
  const correctIndex = getCorrectIndex(item.content)
  const isFixed = item.status === 'duzeltildi'

  return (
    <div className="rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--card-bg)] p-3.5 md:rounded-2xl md:p-5">
      {/* Meta bar */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span
          className="rounded px-[7px] py-0.5 text-[9px] font-extrabold tracking-wider"
          style={{
            backgroundColor: isFixed
              ? 'color-mix(in srgb, var(--growth) 15%, transparent)'
              : 'color-mix(in srgb, var(--urgency) 14%, transparent)',
            color: isFixed ? 'var(--growth)' : 'var(--urgency)',
            border: `1px solid ${isFixed ? 'color-mix(in srgb, var(--growth) 27%, transparent)' : 'color-mix(in srgb, var(--urgency) 25%, transparent)'}`,
          }}
        >
          {isFixed ? '✓ ' : '● '}
          {STATUS_LABEL[item.status]}
        </span>

        <span className="rounded px-[7px] py-0.5 text-[10px] font-semibold text-[var(--text-sub)]" style={{ background: 'var(--bg-secondary)' }}>
          {getCategoryLabel(item.category)}
        </span>

        {item.subcategory && (
          <span className="rounded px-[7px] py-0.5 text-[10px] font-semibold text-[var(--text-muted)]" style={{ background: 'var(--bg-secondary)' }}>
            {item.subcategory}
          </span>
        )}

        <div className="flex-1" />

        <span className="text-[10px] text-[var(--text-muted)]">
          {item.wrongCount > 1 ? `${item.wrongCount} kez yanlış · ` : ''}
          {formatDate(item.lastWrongAt)}
        </span>
      </div>

      {/* Oncul */}
      {item.content.passage && (
        <p className="mb-2 whitespace-pre-line text-[12.5px] leading-[1.7] text-[var(--text-sub)]">
          {renderRichText(item.content.passage)}
        </p>
      )}

      {/* Soru metni */}
      <p className="mb-3 text-[13px] font-medium leading-[1.7] md:text-[14.5px]">
        {renderRichText(item.content.question || item.content.sentence)}
      </p>

      {/* Siklar */}
      <div className="space-y-1.5">
        {item.content.options.map((opt, i) => {
          const state =
            i === correctIndex ? 'correct' : i === item.userSelectedOption ? 'wrong' : 'dim'
          return (
            <OptionButton key={i} index={i} text={opt} state={state} onClick={() => {}} />
          )
        })}
      </div>

      <SolutionBlock solution={item.content.solution} tone={item.status} />
    </div>
  )
}

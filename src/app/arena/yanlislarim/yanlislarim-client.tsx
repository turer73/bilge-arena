'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  FlaskConical,
  Globe2,
  Languages,
  Lightbulb,
  LockKeyhole,
  NotebookPen,
  RotateCcw,
  SearchX,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, GAME_SLUGS, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { getCorrectIndex } from '@/lib/utils/question'
import { renderRichText } from '@/lib/utils/rich-text'
import { trUpper } from '@/lib/utils/tr-text'
import { OptionButton } from '@/components/game/option-button'
import { SolutionBlock } from '@/components/game/solution-block'
import { bilgeImage } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import type { QuestionContent } from '@/types/database'
import {
  REVIEW_ERROR_REASON_OPTIONS,
  type ReviewErrorReasonCode,
} from '@/lib/review/error-reasons'

const GAME_ICONS: Record<GameSlug, LucideIcon> = {
  matematik: Calculator,
  turkce: BookOpen,
  fen: FlaskConical,
  sosyal: Globe2,
  wordquest: Languages,
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
  /** FSRS tekrar-zamani (konu#7 S1/S4). FSRS rollout disinda null. */
  isDue: boolean | null
  dueAt: string | null
  stability: number | null
  fsrsDifficulty: number | null
  retrievability: number | null
  reviewState: 'new' | 'learning' | 'review' | 'relearning' | null
  errorReason: { code: ReviewErrorReasonCode; label: string } | null
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

async function saveErrorReason(
  questionId: string,
  reasonCode: ReviewErrorReasonCode,
): Promise<NonNullable<WrongAnswerItem['errorReason']>> {
  const res = await fetch('/api/review/wrong-answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, reasonCode }),
  })
  if (!res.ok) throw new Error('Hata nedeni kaydedilemedi')
  const data = (await res.json()) as { errorReason: NonNullable<WrongAnswerItem['errorReason']> }
  return data.errorReason
}

export default function YanlislarimClient() {
  const { user, loading: authLoading } = useAuthStore()
  const { character } = useBilgeCharacter()

  const [gameFilter, setGameFilter] = useState<GameFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [items, setItems] = useState<WrongAnswerItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [everHadAny, setEverHadAny] = useState<boolean | null>(null)
  const [savingReasonIds, setSavingReasonIds] = useState<Set<string>>(() => new Set())
  const [reasonErrorIds, setReasonErrorIds] = useState<Set<string>>(() => new Set())

  // Filtre-nesli sayaci: her filtre degisiminde artar. loadMore, cagrildigi
  // andaki nesli yakalayip cevap gelince karsilastirir -- filtre bu arada
  // degistiyse (yeni nesil basladiysa) eski sayfa-yanitini listeye EKLEMEZ
  // (stale-response guard, Vercel Agent Review bulgusu, PR#273).
  const requestGenRef = useRef(0)

  // Filtre degisince listeyi bastan yukle
  useEffect(() => {
    if (!user) return
    const myGen = ++requestGenRef.current
    setLoading(true)
    setError(false)

    fetchWrongAnswers(gameFilter, statusFilter, 1)
      .then((data) => {
        if (requestGenRef.current !== myGen) return
        setItems(data.items)
        setPage(1)
        setHasMore(data.hasMore)
        // Filtresiz ilk yukleme sonucuna gore "hic yanlisi yok" bos-durumunu belirle
        if (gameFilter === 'all' && statusFilter === 'all') {
          setEverHadAny(data.items.length > 0)
        }
      })
      .catch(() => {
        if (requestGenRef.current === myGen) setError(true)
      })
      .finally(() => {
        if (requestGenRef.current === myGen) setLoading(false)
      })
  }, [user, gameFilter, statusFilter, retryNonce])

  const loadMore = useCallback(() => {
    if (loadingMore) return
    setLoadingMore(true)
    const myGen = requestGenRef.current
    const nextPage = page + 1
    fetchWrongAnswers(gameFilter, statusFilter, nextPage)
      .then((data) => {
        // Filtre bu istek ucarken degistiyse (yeni nesil basladiysa) eski
        // sayfa-yanitini ATLA -- aksi halde yanlis-filtreli sonuclar yeni
        // listeye karisir.
        if (requestGenRef.current !== myGen) return
        setItems((prev) => [...prev, ...data.items])
        setPage(nextPage)
        setHasMore(data.hasMore)
      })
      .catch(() => {
        if (requestGenRef.current === myGen) setError(true)
      })
      .finally(() => setLoadingMore(false))
  }, [gameFilter, statusFilter, page, loadingMore])

  const changeErrorReason = useCallback(async (
    questionId: string,
    reasonCode: ReviewErrorReasonCode,
  ) => {
    setSavingReasonIds((current) => new Set(current).add(questionId))
    setReasonErrorIds((current) => {
      const next = new Set(current)
      next.delete(questionId)
      return next
    })
    try {
      const errorReason = await saveErrorReason(questionId, reasonCode)
      setItems((current) => current.map((item) => (
        item.questionId === questionId ? { ...item, errorReason } : item
      )))
    } catch {
      setReasonErrorIds((current) => new Set(current).add(questionId))
    } finally {
      setSavingReasonIds((current) => {
        const next = new Set(current)
        next.delete(questionId)
        return next
      })
    }
  }, [])

  if (authLoading) {
    return (
      <MistakesShell>
        <div className="mx-auto flex min-h-[62vh] max-w-[1180px] items-center justify-center px-4">
          <div className="flex items-center gap-3 rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card)] px-5 py-4 text-sm font-black shadow-[0_5px_0_var(--app-border)]">
            <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-[var(--app-border)] border-t-[var(--app-accent)]" />
            Hata defterin hazırlanıyor
          </div>
        </div>
      </MistakesShell>
    )
  }

  if (!user) {
    return (
      <MistakesShell>
        <Header />
        <main className="mx-auto w-full max-w-[1180px] px-3 pt-3 md:px-5 lg:px-6 lg:pt-0">
          <section className="relative min-h-[360px] overflow-hidden rounded-[28px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-6 shadow-[0_7px_0_var(--app-border)] md:min-h-[410px] md:p-10">
            <HeroBackdrop />
            <Image
              src={bilgeImage(character, 'destekleyici')}
              alt="Bilge, hata defteri rehberin"
              width={320}
              height={320}
              sizes="(min-width: 768px) 310px, 200px"
              className="pointer-events-none absolute -bottom-7 right-0 z-[1] h-[205px] w-auto object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,.28)] md:right-10 md:h-[315px]"
            />
            <div className="relative z-10 max-w-[76%] md:max-w-xl">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]"><Sparkles size={14} /> Akıllı tekrar alanı</p>
              <h2 className="mt-3 max-w-lg text-3xl font-black leading-[1.08] md:text-5xl">Yanlışını gör, nedenini bul, tekrar güçlen.</h2>
              <p className="mt-4 max-w-lg text-sm font-semibold leading-6 text-[var(--app-text-sub)] md:text-base">Yanlış cevapların çözümü ve hata kaynağı tek bir öğrenme defterinde toplanır.</p>
              <Link href="/giris" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-0.5 active:shadow-none">
                <LockKeyhole size={18} /> Giriş Yap
              </Link>
              <p className="mt-3 text-xs font-semibold text-[var(--app-text-muted)]">Giriş Yapmanız Gerekiyor</p>
            </div>
          </section>
          <div className="mt-5 grid gap-3 md:grid-cols-3 md:gap-5">
            <FeatureCard Icon={Target} title="Hatayı yakala" text="Yanlış seçimin ile doğru cevabı yan yana gör." />
            <FeatureCard Icon={Lightbulb} title="Çözümü incele" text="Sorunun çözüm mantığını sakin biçimde tekrar et." />
            <FeatureCard Icon={ShieldCheck} title="Nedenini belirle" text="Bilgi, dikkat veya süre hatasını işaretleyip örüntünü gör." />
          </div>
        </main>
      </MistakesShell>
    )
  }

  const grouped: { game: GameSlug; items: WrongAnswerItem[] }[] = GAME_SLUGS
    .map((game) => ({ game, items: items.filter((item) => item.game === game) }))
    .filter((group) => group.items.length > 0)
  const dueCount = items.filter((item) => item.isDue === true).length
  const fixedCount = items.filter((item) => item.status === 'duzeltildi').length

  return (
    <MistakesShell>
      <Header />
      <main data-mistakes-content className="mx-auto w-full max-w-[1180px] px-3 pt-3 md:px-5 lg:px-6 lg:pt-0">
        <section data-mistakes-hero className="relative min-h-[205px] overflow-hidden rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-[0_6px_0_var(--app-border)] md:min-h-[230px] md:p-7">
          <HeroBackdrop />
          <Image src={bilgeImage(character, items.length > 0 ? 'odaklanmis' : 'destekleyici')} alt="Bilge, hata defteri rehberin" width={260} height={260} sizes="(min-width: 768px) 235px, 150px" className="pointer-events-none absolute -bottom-8 right-0 z-[1] h-[158px] w-auto object-contain drop-shadow-[0_12px_22px_rgba(15,23,42,.28)] md:right-8 md:h-[235px]" />
          <div className="relative z-10 max-w-[70%] md:max-w-[64%]">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--app-accent-text)]"><Sparkles size={14} /> Bilge ile akıllı tekrar</p>
            <h2 className="mt-2 text-2xl font-black leading-tight md:text-3xl">Her yanlış, bir sonraki doğruya ipucu verir.</h2>
            <p className="mt-2 hidden max-w-xl text-sm font-semibold leading-6 text-[var(--app-text-sub)] sm:block">Cevabını, çözümü ve hatanın kaynağını birlikte incele; tekrar sırası gelen sorulara öncelik ver.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black">
              <MetricChip Icon={NotebookPen} value={items.length} label="görünen soru" />
              <MetricChip Icon={Clock3} value={dueCount} label="sırası gelen" tone="warn" />
              <MetricChip Icon={CheckCircle2} value={fixedCount} label="düzeltildi" tone="success" />
            </div>
          </div>
        </section>

        <div data-mistakes-layout className="mt-5 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_280px] md:gap-5 lg:grid-cols-[minmax(0,1fr)_310px] lg:gap-6">
          <aside data-mistakes-filters className="space-y-4 md:col-start-2 md:row-start-1 lg:sticky lg:top-[calc(var(--navbar-h)+1.5rem)]" aria-label="Yanlışlarım filtreleri">
            <FilterPanel gameFilter={gameFilter} statusFilter={statusFilter} onGameChange={setGameFilter} onStatusChange={setStatusFilter} />
            <section className="hidden rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-border)] md:block">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]"><Lightbulb size={21} strokeWidth={2.6} /></span>
              <h3 className="mt-3 text-sm font-black">Küçük bir yöntem</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">Önce kendi yanlış seçimini, sonra doğru cevabı ve en son çözümü oku. Hata nedenini işaretlemek tekrar planını anlamlandırır.</p>
            </section>
          </aside>

          <section data-mistakes-main className="min-w-0 md:col-start-1 md:row-start-1">
            {loading && <LoadingState />}

            {!loading && error && <StateCard Icon={AlertTriangle} title="Yanlışların yüklenemedi" text="Bağlantıyı kontrol edip aynı filtrelerle yeniden deneyebilirsin." tone="danger" action={<button type="button" onClick={() => setRetryNonce((value) => value + 1)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--app-danger-strong)] px-4 text-xs font-black text-white shadow-[0_4px_0_var(--app-danger)] active:translate-y-0.5 active:shadow-none"><RotateCcw size={15} /> Tekrar dene</button>} />}

            {!loading && !error && everHadAny === false && <StateCard Icon={Trophy} title="Tertemiz bir sicilin var!" text="Henüz hiç yanlış cevabın yok. Oynadıkça tekrar etmen gereken sorular burada birikecek." tone="success" action={<Link href="/arena" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--app-accent)] px-4 text-xs font-black text-white shadow-[0_4px_0_var(--app-accent-strong)]">Oyunlara dön</Link>} />}

            {!loading && !error && everHadAny === true && items.length === 0 && <StateCard Icon={SearchX} title="Bu filtrede soru yok" text="Başka bir ders veya durum seçebilir ya da tüm yanlışlarına dönebilirsin." action={<button type="button" onClick={() => { setGameFilter('all'); setStatusFilter('all') }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-4 text-xs font-black text-[var(--app-text)]"><RotateCcw size={15} /> Filtreleri temizle</button>} />}

            {!loading && !error && grouped.length > 0 && (
              <div className="space-y-6">
                {grouped.map(({ game, items: gameItems }) => {
                  const GameIcon = GAME_ICONS[game]
                  return (
                    <section key={game} className="animate-fadeUp" aria-labelledby={`wrong-group-${game}`}>
                      <div className="mb-3 flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border-2 bg-[var(--app-card)] shadow-[0_3px_0_var(--app-border)]" style={{ borderColor: `color-mix(in srgb, ${GAMES[game].colorHex} 42%, var(--app-border))`, color: GAMES[game].colorHex }}><GameIcon size={20} strokeWidth={2.6} /></span>
                        <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Ders grubu</p><h3 id={`wrong-group-${game}`} className="text-sm font-black text-[var(--app-text)]">{trUpper(GAMES[game].name)} <span className="text-[var(--app-text-muted)]">· {gameItems.length} soru</span></h3></div>
                      </div>
                      <div className="space-y-4">
                        {gameItems.map((item) => <WrongAnswerCard key={item.questionId} item={item} savingReason={savingReasonIds.has(item.questionId)} reasonError={reasonErrorIds.has(item.questionId)} onReasonChange={changeErrorReason} />)}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}

            {!loading && !error && hasMore && (
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={loadMore} disabled={loadingMore} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-6 text-xs font-black text-[var(--app-text-sub)] shadow-[0_4px_0_var(--app-border)] transition-transform active:translate-y-0.5 active:shadow-none disabled:opacity-50">
                  {loadingMore ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--app-border)] border-t-[var(--app-accent)]" /> : <ChevronDown size={16} />}
                  {loadingMore ? 'Yükleniyor…' : 'Daha Fazla Yükle'}
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </MistakesShell>
  )
}

function MistakesShell({ children }: { children: ReactNode }) {
  return (
    <div data-mistakes-screen className="min-h-[100dvh] bg-[var(--app-bg)] pb-24 text-[var(--app-text)] lg:bg-transparent lg:pb-10">
      <style>{`@media (max-width: 1023px) { [data-app-navbar] { display: none !important; } [data-arena-main] { padding-top: 0 !important; } }`}</style>
      {children}
    </div>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)]/95 backdrop-blur-xl lg:static lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2.5 px-4 lg:h-auto lg:px-6 lg:pb-5 lg:pt-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><NotebookPen size={22} strokeWidth={2.7} /></span>
        <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Akıllı tekrar</p><h1 className="text-lg font-black leading-5 md:text-2xl">Yanlışlarım</h1></div>
      </div>
    </header>
  )
}

function HeroBackdrop() {
  return (
    <>
      <Image src="/academy/academy-landscape.png" alt="" fill priority sizes="(min-width: 1024px) 1120px, 100vw" className="pointer-events-none object-cover object-center opacity-35" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--app-card)] via-[var(--app-card)]/95 to-[var(--app-card)]/20" />
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[32px] border-[var(--app-accent)]/10" />
    </>
  )
}

function FeatureCard({ Icon, title, text }: { Icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-[0_5px_0_var(--app-border)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><Icon size={22} strokeWidth={2.5} /></span>
      <h3 className="mt-4 text-base font-black">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">{text}</p>
    </article>
  )
}

function MetricChip({ Icon, value, label, tone = 'accent' }: { Icon: LucideIcon; value: number; label: string; tone?: 'accent' | 'warn' | 'success' }) {
  const className = tone === 'warn'
    ? 'border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]'
    : tone === 'success'
      ? 'border-[var(--app-success-border)] bg-[var(--app-success-tint)] text-[var(--app-success-ink)]'
      : 'border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]'
  return <span className={`inline-flex items-center rounded-xl border px-3 py-2 ${className}`}><Icon size={13} className="mr-1.5" />{value} {label}</span>
}

function FilterPanel({ gameFilter, statusFilter, onGameChange, onStatusChange }: { gameFilter: GameFilter; statusFilter: StatusFilter; onGameChange: (game: GameFilter) => void; onStatusChange: (status: StatusFilter) => void }) {
  return (
    <section className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-border)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><Filter size={20} strokeWidth={2.6} /></span>
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Görünümü daralt</p><h2 className="mt-0.5 text-base font-black">Filtreler</h2></div>
      </div>
      <fieldset>
        <legend className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Ders</legend>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <FilterButton active={gameFilter === 'all'} onClick={() => onGameChange('all')} Icon={NotebookPen} label="Tüm Dersler" />
          {GAME_SLUGS.map((game) => <FilterButton key={game} active={gameFilter === game} onClick={() => onGameChange(game)} Icon={GAME_ICONS[game]} label={GAMES[game].name} color={GAMES[game].colorHex} />)}
        </div>
      </fieldset>
      <div className="my-4 h-px bg-[var(--app-border-soft)]" />
      <fieldset>
        <legend className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Durum</legend>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
          <FilterButton active={statusFilter === 'all'} onClick={() => onStatusChange('all')} Icon={Target} label="Tümü" />
          <FilterButton active={statusFilter === 'acik'} onClick={() => onStatusChange('acik')} Icon={Clock3} label="Açık" tone="danger" />
          <FilterButton active={statusFilter === 'duzeltildi'} onClick={() => onStatusChange('duzeltildi')} Icon={CheckCircle2} label="Düzeltildi" tone="success" />
        </div>
      </fieldset>
    </section>
  )
}

function FilterButton({ active, onClick, Icon, label, color, tone = 'accent' }: { active: boolean; onClick: () => void; Icon: LucideIcon; label: string; color?: string; tone?: 'accent' | 'danger' | 'success' }) {
  const activeClass = tone === 'danger'
    ? 'border-[var(--app-danger)] bg-[var(--app-danger-tint)] text-[var(--app-danger-ink)]'
    : tone === 'success'
      ? 'border-[var(--app-success-solid)] bg-[var(--app-success-tint)] text-[var(--app-success-ink)]'
      : 'border-[var(--app-accent)] bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]'
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 text-left text-[11px] font-black transition-colors ${active ? activeClass : 'border-[var(--app-border)] bg-[var(--app-card-sunken)] text-[var(--app-text-sub)] hover:border-[var(--app-accent-border)]'}`}>
      <Icon size={16} strokeWidth={2.6} style={!active && color ? { color } : undefined} /><span className="min-w-0 truncate">{label}</span>{active && <CheckCircle2 size={14} className="ml-auto shrink-0" />}
    </button>
  )
}

function LoadingState() {
  return <div data-mistakes-loading className="space-y-4" aria-label="Yanlışlar yükleniyor">{[0, 1].map((index) => <div key={index} className="animate-pulse rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-[0_5px_0_var(--app-border)]"><div className="h-5 w-32 rounded-lg bg-[var(--app-card-sunken)]" /><div className="mt-5 h-6 w-4/5 rounded-lg bg-[var(--app-card-sunken)]" /><div className="mt-5 space-y-3"><div className="h-14 rounded-2xl bg-[var(--app-card-sunken)]" /><div className="h-14 rounded-2xl bg-[var(--app-card-sunken)]" /></div></div>)}</div>
}

function StateCard({ Icon, title, text, action, tone = 'accent' }: { Icon: LucideIcon; title: string; text: string; action?: ReactNode; tone?: 'accent' | 'danger' | 'success' }) {
  const iconClass = tone === 'danger' ? 'bg-[var(--app-danger-tint)] text-[var(--app-danger-ink)]' : tone === 'success' ? 'bg-[var(--app-success-tint)] text-[var(--app-success-ink)]' : 'bg-[var(--app-accent-tint)] text-[var(--app-accent)]'
  return (
    <div className="rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] px-5 py-10 text-center shadow-[0_6px_0_var(--app-border)] md:px-8 md:py-14">
      <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] ${iconClass}`}><Icon size={30} strokeWidth={2.4} /></span>
      <h2 className="mt-5 text-xl font-black">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[var(--app-text-sub)]">{text}</p>{action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function WrongAnswerCard({
  item,
  savingReason,
  reasonError,
  onReasonChange,
}: {
  item: WrongAnswerItem
  savingReason: boolean
  reasonError: boolean
  onReasonChange: (questionId: string, reasonCode: ReviewErrorReasonCode) => void
}) {
  const correctIndex = getCorrectIndex(item.content)
  const isFixed = item.status === 'duzeltildi'

  return (
    <article data-wrong-answer-card className="overflow-hidden rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_6px_0_var(--app-border)]">
      <div className={`h-1.5 ${isFixed ? 'bg-[var(--app-success-solid)]' : 'bg-[var(--app-danger)]'}`} />
      <div className="p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-black uppercase tracking-[0.1em] ${isFixed ? 'border-[var(--app-success-border)] bg-[var(--app-success-tint)] text-[var(--app-success-ink)]' : 'border-[var(--app-danger-border)] bg-[var(--app-danger-tint)] text-[var(--app-danger-ink)]'}`}>
            {isFixed ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{STATUS_LABEL[item.status]} soru
          </span>
          {item.isDue === true && <span className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--app-warn-ink)]"><RotateCcw size={13} /> Tekrar Zamanı</span>}
          <span className="rounded-lg bg-[var(--app-card-sunken)] px-2.5 py-1.5 text-[10px] font-black text-[var(--app-text-sub)]">{getCategoryLabel(item.category)}</span>
          {item.subcategory && <span className="rounded-lg bg-[var(--app-card-sunken)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--app-text-muted)]">{item.subcategory}</span>}
          <span className="ml-auto text-[10px] font-bold text-[var(--app-text-muted)]">{item.wrongCount > 1 ? `${item.wrongCount} kez yanlış · ` : ''}{formatDate(item.lastWrongAt)}</span>
        </div>

        {item.content.passage && (
          <div className="mt-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4">
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--app-accent-text)]">Öncül</p>
            <p className="whitespace-pre-line text-[13px] font-semibold leading-6 text-[var(--app-text-sub)]">{renderRichText(item.content.passage)}</p>
          </div>
        )}

        <div className="mt-5 flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><Target size={18} strokeWidth={2.6} /></span>
          <p className="text-[15px] font-black leading-7 text-[var(--app-text)] md:text-[17px]">{renderRichText(item.content.question || item.content.sentence)}</p>
        </div>

        <div className="mt-5 space-y-2.5 rounded-[20px] bg-[var(--app-card-sunken)] p-3 md:p-4">
          {item.content.options.map((option, index) => {
            const state = index === correctIndex ? 'correct' : index === item.userSelectedOption ? 'wrong' : 'dim'
            return <OptionButton key={index} index={index} text={option} state={state} onClick={() => {}} />
          })}
        </div>

        <SolutionBlock solution={item.content.solution} tone={item.status} />

        <section className="mt-4 rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4" aria-labelledby={`reason-${item.questionId}`}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]"><Lightbulb size={18} strokeWidth={2.6} /></span>
            <div><h4 id={`reason-${item.questionId}`} className="text-sm font-black">Bu yanlışa ne sebep oldu?</h4><p className="mt-0.5 text-[10px] font-semibold text-[var(--app-text-muted)]">Seçimin, benzer sorulara nasıl hazırlanacağını anlamana yardım eder.</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Hata nedeni">
          {REVIEW_ERROR_REASON_OPTIONS.map((reason) => {
            const selected = item.errorReason?.code === reason.code
            return (
              <button
                key={reason.code}
                type="button"
                aria-pressed={selected}
                disabled={savingReason}
                onClick={() => onReasonChange(item.questionId, reason.code)}
                className={`min-h-9 rounded-xl border-2 px-3 text-[10px] font-black transition-colors disabled:cursor-wait disabled:opacity-60 ${selected ? 'border-[var(--app-accent)] bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]' : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-sub)] hover:border-[var(--app-accent-border)]'}`}
              >
                {reason.label}
              </button>
            )
          })}
          </div>
          {savingReason && <p role="status" className="mt-2 text-[10px] font-bold text-[var(--app-accent-text)]">Hata nedeni kaydediliyor…</p>}
          {reasonError && <p role="alert" className="mt-2 text-[10px] font-bold text-[var(--app-danger-ink)]">Hata nedeni kaydedilemedi. Lütfen yeniden dene.</p>}
        </section>
      </div>
    </article>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { useMasteryMap, type MasteryOutcome } from '@/lib/hooks/use-mastery-map'
import { useGameStore } from '@/stores/game-store'

interface MasteryActionCardProps {
  game: GameSlug
  userId?: string | null
  examRef?: string | null
}

function byLowestReliableScore(a: MasteryOutcome, b: MasteryOutcome) {
  return a.score - b.score || b.attempts - a.attempts
}

export function MasteryActionCard({ game, userId, examRef }: MasteryActionCardProps) {
  const router = useRouter()
  const gameStore = useGameStore()
  const {
    response,
    outcomes,
    discovery,
    coverage,
    loading,
    error,
    fetchMastery,
  } = useMasteryMap(game, userId, examRef)

  if (!userId || loading) return null

  if (error || (coverage.supported && outcomes.length === 0)) {
    return (
      <article className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-border)]">
        <p className="text-[10px] font-black tracking-[0.16em] text-[var(--app-text-muted)]">KEŞİF SEVİYESİ</p>
        <h2 className="mt-1 text-sm font-black text-[var(--app-text)]">Kanıt haritası şu anda yüklenemedi</h2>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">
          Serbest pratiğe devam edebilirsin; bu durum puanını veya ilerlemeni etkilemez.
        </p>
        <button
          type="button"
          onClick={() => void fetchMastery()}
          className="mt-3 min-h-11 rounded-xl border-2 border-[var(--app-border)] px-4 text-xs font-black text-[var(--app-text)]"
        >
          Tekrar Dene
        </button>
      </article>
    )
  }

  if (response && !coverage.supported) {
    return (
      <article className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-border)]">
        <p className="text-[10px] font-black tracking-[0.16em] text-[var(--app-accent-text)]">KEŞİF SEVİYESİ HAZIRLANIYOR</p>
        <h2 className="mt-1 text-sm font-black text-[var(--app-text)]">{GAMES[game].name} kanıt haritası doğrulanıyor</h2>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">
          Bu ders ve sınav kapsamı tam eşleşmeden seviye göstermiyoruz. Serbest pratik güvenle kullanılabilir.
        </p>
        <Link href={`/arena/${game}`} className="mt-2 inline-flex min-h-11 items-center text-xs font-black text-[var(--app-accent-text)] hover:underline">
          Serbest pratikle devam et
        </Link>
      </article>
    )
  }

  if (!response || outcomes.length === 0) return null

  const strongCount = outcomes.filter((outcome) => outcome.status === 'mastered').length
  const developing = outcomes
    .filter((outcome) => outcome.status === 'developing')
    .sort(byLowestReliableScore)
  const collectingEvidence = outcomes
    .filter((outcome) => outcome.status === 'insufficient')
    .sort((a, b) => a.verifiedEvidenceDays - b.verifiedEvidenceDays
      || a.attempts - b.attempts
      || a.title.localeCompare(b.title, 'tr'))
  // Yeterli kanıtı olan gelişen kazanım önce gelir. Kanıtı yetersiz konu “zayıf” diye sunulmaz.
  const nextAction = developing[0] ?? collectingEvidence[0]

  const mapParams = new URLSearchParams({ game })
  if (examRef) mapParams.set('exam_ref', examRef)
  const mapHref = `/arena/hakimiyet?${mapParams}`
  const diagnosticParams = new URLSearchParams({ game })
  const diagnosticExamRef = outcomes[0]?.examRef ?? examRef
  if (diagnosticExamRef) diagnosticParams.set('exam_ref', diagnosticExamRef)
  const diagnosticHref = `/arena/tani?${diagnosticParams}`

  const handlePractice = () => {
    if (!nextAction) return
    gameStore.setGame(nextAction.game as GameSlug)
    gameStore.setCategory(nextAction.category)
    // Mastery Wordquest'i YDT etiketiyle gosterir; soru bankasi ise exam_ref
    // NULL saklar. Display etiketini quiz filtresine tasima ve onceki dersin
    // paylasilan sinav tercihini silme.
    if (nextAction.game !== 'wordquest') gameStore.setExamRef(nextAction.examRef)
    gameStore.setMode('practice')
    router.push(`/arena/${nextAction.game}`)
  }

  if (discovery?.stage === 'estimate' && nextAction) {
    return (
      <article
        className="animate-fadeUp overflow-hidden rounded-[22px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-shadow-accent)]"
        style={{ animationDelay: '0.34s', animationFillMode: 'both' }}
      >
        <div className="border-b-2 border-[var(--app-border-soft)] bg-[var(--app-accent-tint)] px-4 py-3">
          <p className="text-[10px] font-black tracking-[0.16em] text-[var(--app-accent-text)]">KEŞİF SEVİYESİ 1/3</p>
          <p className="mt-0.5 text-[10px] font-semibold text-[var(--app-text-sub)]">Henüz not vermiyoruz; başlangıç yönünü arıyoruz.</p>
        </div>
        <div className="p-4 md:p-5">
          <h2 className="text-base font-black text-[var(--app-text)]">Nereden başlayacağını birlikte bulalım</h2>
          <p className="mt-2 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">
            {coverage.diagnosticAvailable
              ? 'Kısa başlangıç taraması çekirdek kazanımlar için düşük güvenli bir ilk tahmin üretir. Kalıcı hâkimiyet kararı yalnız doğrulanmış pratik kanıtlarıyla açılır.'
              : 'Kısa pratiklerde verdiğin doğrulanmış cevaplarla başlangıç rotan oluşur. Yeterli kanıt olmadan güçlü veya zayıf etiketi göstermeyiz.'}
          </p>
          {coverage.diagnosticAvailable ? (
            <Link
              href={diagnosticHref}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
            >
              Keşif Turunu Başlat
            </Link>
          ) : (
            <button
              type="button"
              onClick={handlePractice}
              className="mt-4 min-h-12 w-full rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
            >
              Keşif Pratiğini Başlat
            </button>
          )}
          <Link href={mapHref} className="mt-2 flex min-h-11 items-center justify-center text-xs font-black text-[var(--app-text-sub)] hover:text-[var(--app-accent-text)] hover:underline">
            Boş kanıt haritasını gör
          </Link>
        </div>
      </article>
    )
  }

  if (!nextAction) {
    return (
      <article
        className="animate-fadeUp rounded-[22px] border-2 border-[var(--app-success-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-success-border)]"
        style={{ animationDelay: '0.34s', animationFillMode: 'both' }}
      >
        <p className="text-[10px] font-black tracking-[0.16em] text-[var(--app-success-ink)]">GÜÇLÜ</p>
        <h2 className="mt-1 text-sm font-black text-[var(--app-text)]">Takip edilen kazanımların güçlü görünüyor</h2>
        <p className="mt-1 text-xs font-semibold text-[var(--app-text-sub)]">Planını tamamlayarak seviyeni koruyabilirsin.</p>
        <Link href={mapHref} className="mt-2 inline-flex min-h-11 items-center text-xs font-black text-[var(--app-accent-text)] hover:underline">
          Hâkimiyet haritanı aç
        </Link>
      </article>
    )
  }

  const needsEvidence = nextAction.status === 'insufficient'
  const statusLabel = needsEvidence ? 'KANIT TOPLA' : 'GELİŞİYOR'
  const progress = needsEvidence ? nextAction.evidenceCompleteness : nextAction.score

  return (
    <article
      className="animate-fadeUp overflow-hidden rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-border)]"
      style={{ animationDelay: '0.34s', animationFillMode: 'both' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card-sunken)] px-4 py-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.16em] text-[var(--app-accent-text)]">
            {discovery?.stage === 'evidence' ? 'KEŞİF SEVİYESİ 2/3' : 'SIRADAKİ EN İYİ ADIM'}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-[var(--app-text-sub)]">
            {discovery?.stage === 'evidence'
              ? `${discovery.evidenceCollected}/${discovery.evidenceTarget} farklı gün kanıtı · ${discovery.readyOutcomes}/${discovery.totalOutcomes} kazanım hazır`
              : 'Planından sonra buna odaklan'}
          </p>
        </div>
        <div className="flex gap-1.5" aria-label="Kazanım durumları">
          {strongCount > 0 && (
            <span className="rounded-full bg-[var(--growth)]/10 px-2 py-1 text-[9px] font-bold text-[var(--growth-text)]">
              {strongCount} güçlü
            </span>
          )}
          {developing.length > 0 && (
            <span className="rounded-full bg-[var(--focus)]/10 px-2 py-1 text-[9px] font-bold text-[var(--focus-text)]">
              {developing.length} gelişiyor
            </span>
          )}
        </div>
      </div>

      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[10px] font-extrabold tracking-[0.14em] ${needsEvidence ? 'text-[var(--wisdom-text)]' : 'text-[var(--focus-text)]'}`}>
              {statusLabel}
            </p>
            <h2 className="mt-1 text-sm font-black text-[var(--app-text)] md:text-base">{nextAction.title}</h2>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-[var(--focus-text)]">
            {needsEvidence ? `${nextAction.verifiedEvidenceDays}/3 gün` : `%${nextAction.score}`}
          </span>
        </div>

        <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--app-text-sub)]">
          {needsEvidence
            ? 'Bu kazanım hakkında ilk yönlendirmeyi açmak için farklı günlerde pratik kanıtı gerekiyor.'
            : 'Kısa bir pratik, bu kazanımı güçlü seviyeye yaklaştıracak.'}
        </p>

        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--app-border-soft)] p-[2px]" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--app-accent)]" style={{ width: `${progress}%` }} />
        </div>

        <button
          type="button"
          onClick={handlePractice}
          className="mt-4 min-h-12 w-full rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
        >
          {needsEvidence ? 'Kanıt İçin Pratik Yap' : 'Bu Kazanımı Çalış'}
        </button>
        <Link href={mapHref} className="mt-2 flex min-h-11 items-center justify-center text-xs font-black text-[var(--app-text-sub)] hover:text-[var(--app-accent-text)] hover:underline">
          Tüm hâkimiyet haritasını aç
        </Link>
      </div>
    </article>
  )
}

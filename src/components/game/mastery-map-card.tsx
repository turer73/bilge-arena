'use client'

import Link from 'next/link'
import type { MasteryOutcome } from '@/lib/hooks/use-mastery-map'
import type { MasteryDiscoveryPublic } from '@/lib/mastery/discovery'

interface MasteryMapCardProps {
  outcomes: MasteryOutcome[]
  discovery: MasteryDiscoveryPublic | null
  diagnosticAvailable: boolean
  loading: boolean
}

const STATUS_LABEL = {
  insufficient: 'Kanıt birikiyor',
  developing: 'Gelişiyor',
  mastered: 'Ustalaştın',
} as const

/** Lobi özeti; ayrıntılı kanıt ağacı ayrı hâkimiyet ekranında gösterilir. */
export function MasteryMapCard({ outcomes, discovery, diagnosticAvailable, loading }: MasteryMapCardProps) {
  if (loading || outcomes.length === 0) return null

  const mapParams = new URLSearchParams({ game: outcomes[0].game })
  if (outcomes[0].examRef) mapParams.set('exam_ref', outcomes[0].examRef)
  const mapHref = `/arena/hakimiyet?${mapParams}`
  const diagnosticParams = new URLSearchParams({ game: outcomes[0].game })
  if (outcomes[0].examRef) diagnosticParams.set('exam_ref', outcomes[0].examRef)
  const diagnosticHref = `/arena/tani?${diagnosticParams}`
  const practiceParams = new URLSearchParams({ category: outcomes[0].category })
  if (outcomes[0].examRef) practiceParams.set('exam_ref', outcomes[0].examRef)
  const practiceHref = `/arena/${outcomes[0].game}?${practiceParams}`

  if (discovery && discovery.stage !== 'ready') {
    const estimateStage = discovery.stage === 'estimate'
    const diagnosticEstimate = estimateStage && diagnosticAvailable
    return (
      <article className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.34s', animationFillMode: 'both' }}>
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
          <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            KEŞİF SEVİYESİ {discovery.level}/3
          </span>
          <span className="text-[10px] font-bold text-[var(--focus)]">
            %{discovery.journeyPercentage}
          </span>
        </div>
        <div className="px-3 py-3">
          <h2 className="text-xs font-bold text-[var(--text)]">
            {diagnosticEstimate
              ? 'Başlangıç tahminini birlikte çıkaralım'
              : estimateStage
                ? 'Pratik kanıtlarınla başlangıç rotanı oluşturalım'
                : 'Kanıt ağın netleşiyor'}
          </h2>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-sub)]">
            {diagnosticEstimate
              ? 'Kısa başlangıç taraması yalnız ilk yönü gösterir; başarı ya da eksik hükmü vermez.'
              : estimateStage
                ? 'Kısa pratiklerdeki doğrulanmış cevapların ilk yönü gösterir; yeterli kanıt olmadan başarı ya da eksik hükmü verilmez.'
              : `${discovery.evidenceCollected}/${discovery.evidenceTarget} farklı gün kanıtı toplandı; ${discovery.readyOutcomes}/${discovery.totalOutcomes} kazanım ilk değerlendirmeye hazır.`}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]"
            role="progressbar"
            aria-label="Keşif ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={discovery.journeyPercentage}
          >
            <div className="h-full rounded-full bg-[var(--focus)] transition-[width] duration-500" style={{ width: `${discovery.journeyPercentage}%` }} />
          </div>
          <Link
            href={diagnosticEstimate ? diagnosticHref : estimateStage ? practiceHref : mapHref}
            className="mt-2 inline-flex min-h-10 items-center text-[10px] font-extrabold text-[var(--focus)] hover:underline"
          >
            {diagnosticEstimate
              ? '8 dakikalık keşif turunu başlat'
              : estimateStage
                ? 'Keşif pratiğine geç'
                : 'Kanıt ağını aç'}
          </Link>
        </div>
      </article>
    )
  }

  const outcome = outcomes[0]
  const progress = outcome.status === 'insufficient' ? outcome.evidenceCompleteness : outcome.score

  return (
    <div className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.34s', animationFillMode: 'both' }}>
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          KAZANIM ÖZETİ · İÇ GRAFİK
        </span>
        <span className="text-[10px] font-bold text-[var(--growth)]">
          {STATUS_LABEL[outcome.status]}
        </span>
      </div>

      <div className="px-3 py-3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-xs font-bold text-[var(--text)]">{outcome.title}</p>
          <span className="shrink-0 text-xs font-extrabold text-[var(--growth)]">
            {outcome.status === 'insufficient' ? `${outcome.verifiedEvidenceDays}/3 gün` : `%${outcome.score}`}
          </span>
        </div>
        <p className="mb-2 text-[10px] leading-relaxed text-[var(--text-sub)]">
          Bilge Arena öğrenme grafiğidir; resmî kazanım sınıflandırması değildir.
        </p>

        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-[var(--growth)] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between text-[9px] font-semibold text-[var(--text-sub)]">
          <span>{outcome.correctAttempts}/{outcome.attempts} doğru</span>
          <span>{outcome.delayedCorrect} gecikmeli doğru</span>
        </div>
      </div>
    </div>
  )
}

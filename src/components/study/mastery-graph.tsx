'use client'

import type { MasteryCoveragePublic, MasteryOutcomePublic } from '@/lib/mastery/public-contract'
import type { MasteryDiscoveryPublic } from '@/lib/mastery/discovery'
import type { PublicCurriculumNode } from '@/lib/mastery/graph'

interface MasteryGraphProps {
  graph: PublicCurriculumNode | null
  coverage: MasteryCoveragePublic
  discovery: MasteryDiscoveryPublic | null
  outcomes: MasteryOutcomePublic[]
  onPractice?: (outcome: MasteryOutcomePublic) => void
}

const STATUS_LABEL = {
  insufficient: 'Kanıt birikiyor',
  developing: 'Gelişiyor',
  mastered: 'Ustalaştın',
} as const

const STATUS_CLASS = {
  insufficient: 'text-[var(--text-sub)]',
  developing: 'text-[var(--reward)]',
  mastered: 'text-[var(--growth)]',
} as const

function OutcomeLeaf({
  node,
  outcome,
  onPractice,
}: {
  node: PublicCurriculumNode
  outcome: MasteryOutcomePublic
  onPractice?: (outcome: MasteryOutcomePublic) => void
}) {
  const progress = outcome.status === 'insufficient' ? outcome.evidenceCompleteness : outcome.score
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-[var(--text)]">{node.title}</p>
          <p className={`text-[9px] font-semibold ${STATUS_CLASS[outcome.status]}`}>
            {STATUS_LABEL[outcome.status]}
          </p>
        </div>
        <span className="shrink-0 text-xs font-extrabold text-[var(--growth)]">
          {outcome.status === 'insufficient' ? `${outcome.attempts}/3` : `%${outcome.score}`}
        </span>
      </div>

      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-[var(--growth)] transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {outcome.status === 'insufficient' ? (
        <p className="rounded-lg bg-[var(--bg-secondary)] px-2.5 py-2 text-[9px] leading-4 text-[var(--text-sub)]">
          Hüküm yok: {outcome.attempts}/3 doğrulanmış kanıt toplandı. Doğruluk ve risk metrikleri ilk değerlendirme hazır olduğunda açılır.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-[var(--text-sub)]">
          <span>Zorluk doğruluğu %{outcome.difficultyAccuracy}</span>
          <span>Gecikmeli doğru {outcome.delayedCorrect}</span>
          <span>İpucu oranı %{outcome.hintRate}</span>
          <span>Hızlı yanlış riski %{outcome.fastWrongRate}</span>
        </div>
      )}

      {onPractice && outcome.status !== 'mastered' && (
        <button
          type="button"
          onClick={() => onPractice(outcome)}
          className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          Bu kazanımı çalış
        </button>
      )}
    </article>
  )
}
export function MasteryGraph({ graph, coverage, discovery, outcomes, onPractice }: MasteryGraphProps) {
  if (!coverage.supported) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5 text-center text-xs text-[var(--text-sub)]">
        Bu ders ve sınav kapsamı için kazanım haritası hazırlanıyor.
      </div>
    )
  }

  if (!graph) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5 text-center text-xs text-[var(--text-sub)]">
        Kazanım grafiği şu an yüklenemedi.
      </div>
    )
  }

  const outcomeByCode = new Map(outcomes.map((outcome) => [outcome.code, outcome]))
  return (
    <section aria-labelledby="mastery-graph-title" className="space-y-4">
      {discovery && (
        <div className="rounded-xl border border-[var(--focus)]/25 bg-[var(--focus)]/5 p-4" aria-label="Keşif seviyesi">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--focus)]">KEŞİF SEVİYESİ {discovery.level}/3</p>
              <p className="mt-1 text-sm font-bold text-[var(--text)]">
                {discovery.stage === 'estimate'
                  ? 'Başlangıç tahmini bekleniyor'
                  : discovery.stage === 'evidence'
                    ? 'Kanıt ağı kuruluyor'
                    : 'İlk hâkimiyet haritası hazır'}
              </p>
            </div>
            <span className="text-sm font-black tabular-nums text-[var(--focus)]">%{discovery.journeyPercentage}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]" role="progressbar" aria-label="Keşif ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={discovery.journeyPercentage}>
            <div className="h-full rounded-full bg-[var(--focus)]" style={{ width: `${discovery.journeyPercentage}%` }} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[var(--text-sub)]">
            {coverage.diagnosticAvailable
              ? discovery.diagnosticCompleted
                ? 'Başlangıç tahmini hazır. '
                : 'Kısa başlangıç taraması henüz tamamlanmadı. '
              : 'Başlangıç seviyesi pratik kanıtlarıyla oluşuyor. '}
            {discovery.evidenceCollected}/{discovery.evidenceTarget} doğrulanmış kanıt · {discovery.readyOutcomes}/{discovery.totalOutcomes} kazanım ilk değerlendirmeye hazır. Kanıtı yetersiz alanlar başarısız sayılmaz.
          </p>
        </div>
      )}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
              KAZANIM GRAFİĞİ
            </p>
            <h2 id="mastery-graph-title" className="mt-1 text-base font-bold text-[var(--text)]">
              {graph.title}
            </h2>
          </div>
          <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-1 text-[10px] font-bold text-[var(--growth)]">
            %{coverage.percentage} kapsam
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-sub)]">
          Bilge Arena iç öğrenme grafiği; resmî müfredat kodu değildir. Skor doğruluk, zorluk,
          gecikmeli tekrar, ipucu bağımsızlığı ve hata riski kanıtlarını birlikte açıklar.
        </p>
      </div>

      {graph.children.map((unit) => (
        <section key={unit.code} className="space-y-2">
          <h3 className="px-1 text-sm font-bold text-[var(--text)]">{unit.title}</h3>
          {unit.children.map((topic) => (
            <div key={topic.code} className="space-y-2 rounded-xl bg-[var(--bg-secondary)] p-2">
              <h4 className="px-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-sub)]">
                {topic.title}
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {topic.children.map((leaf) => {
                  const outcome = leaf.outcomeCode ? outcomeByCode.get(leaf.outcomeCode) : null
                  return outcome
                    ? <OutcomeLeaf key={leaf.code} node={leaf} outcome={outcome} onPractice={onPractice} />
                    : null
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </section>
  )
}

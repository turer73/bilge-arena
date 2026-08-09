import type { MockStrategyAnalysis } from '@/lib/mock-strategy/analysis'

const SEGMENT_LABELS = {
  opening: 'Açılış',
  middle: 'Orta bölüm',
  closing: 'Kapanış',
} as const

const RECOMMENDATIONS = {
  check_fast_answers: {
    title: 'Hızlı yanlışlarda kontrol adımı ekle',
    detail: 'İşaretlemeden önce soru kökü ile seçeneği bir kez karşılaştır.',
  },
  set_first_pass_limit: {
    title: 'İlk tur için soru başı sınır koy',
    detail: 'Uzayan soruyu işaretleyip kalan zamanı diğer sorulara bırak.',
  },
  reserve_final_pass: {
    title: 'Son tur için süre ayır',
    detail: 'Kapanış bölümündeki boşları görmek için bitişten önce kontrol payı bırak.',
  },
  timing_evidence_incomplete: {
    title: 'Tempo kanıtı eksik',
    detail: 'Bazı soruların sunucuya ulaşma aralığı oluşmadığı için bu bölümde tempo yorumu yapılmadı.',
  },
  keep_pace: {
    title: 'Mevcut tempoyu koru',
    detail: 'Bölümler arasında belirgin bir tempo riski görünmüyor.',
  },
} as const

export function MockStrategyPanel({ analysis }: { analysis: MockStrategyAnalysis }) {
  return (
    <section
      aria-labelledby="mock-strategy-title"
      className="animate-fadeUp rounded-xl border border-[var(--focus)]/35 bg-[var(--surface)] p-4"
    >
      <p className="text-[10px] font-bold tracking-widest text-[var(--focus)]">AKILLI DENEME</p>
      <h2 id="mock-strategy-title" className="mt-1 font-display text-base font-black">
        Deneme stratejin
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-sub)]">
        Süreler, isteklerin sunucuya ulaşma aralığıdır; kesin düşünme süresi değildir.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {analysis.segments.map(segment => (
          <div key={segment.key} className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-2">
            <div className="text-[10px] font-bold text-[var(--text-sub)]">
              {SEGMENT_LABELS[segment.key]}
            </div>
            <div className="mt-1 text-sm font-black">
              {segment.answered}/{segment.planned}
            </div>
            <div className="text-[9px] text-[var(--text-sub)]">
              {segment.averageSeconds === null ? 'Süre kanıtı yok' : `Ort. ${segment.averageSeconds} sn`}
            </div>
          </div>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div><dt className="text-[9px] text-[var(--text-sub)]">Cevapsız</dt><dd className="font-bold">{analysis.unanswered}</dd></div>
        <div><dt className="text-[9px] text-[var(--text-sub)]">Hızlı yanlış</dt><dd className="font-bold">{analysis.rushedWrong}</dd></div>
        <div><dt className="text-[9px] text-[var(--text-sub)]">Uzayan soru</dt><dd className="font-bold">{analysis.stuck}</dd></div>
      </dl>

      <ul className="mt-3 space-y-2">
        {analysis.recommendations.map(code => (
          <li key={code} className="rounded-lg bg-[var(--card-bg)] p-3 text-xs">
            <div className="font-bold">{RECOMMENDATIONS[code].title}</div>
            <div className="mt-0.5 leading-relaxed text-[var(--text-sub)]">{RECOMMENDATIONS[code].detail}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

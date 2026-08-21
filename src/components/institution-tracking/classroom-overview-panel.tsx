import { AlertTriangle, BarChart3, BookOpenCheck, ShieldCheck, Users } from 'lucide-react'
import type { InstitutionClassroomOverview } from '@/lib/institution-tracking/classroom-overview'
import { EvidenceDistributionChart, PercentBar, SegmentedBar } from './analytics-charts'

const indicatorLabels = {
  studentGrowth: 'Öğrenci gelişimi',
  followUpDiscipline: 'Takip düzeni',
  programManagement: 'Program yönetimi',
  interventionResponsiveness: 'Müdahale etkinliği',
  dataReliability: 'Veri güvenilirliği',
} as const

export function ClassroomOverviewPanel({ overview }: { overview: InstitutionClassroomOverview }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">Sınıf görünümü</p>
          <h2 className="mt-1 truncate text-xl font-black sm:text-2xl">{overview.classroom.name}</h2>
          <p className="mt-1 truncate text-sm text-[var(--text-sub)]">{overview.classroom.teacherAlias}</p>
        </div>
        <span className="w-fit rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-[var(--text-sub)]">
          En az {overview.scope.minimumGroupSize} öğrenci gizlilik eşiği
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.045] to-transparent p-4">
          <h3 className="text-sm font-black">Sınıf kanıt kapsamı</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Karar verilebilir kanıtı bulunan öğrencilerin sınıf içindeki payı.</p>
          <div className="mt-4">
            <EvidenceDistributionChart
              total={overview.summary.activeStudentCount}
              centerValue={overview.summary.studentsWithDecisionSafeEvidence}
              centerLabel="kanıt güvenli"
              ariaLabel={`${overview.summary.activeStudentCount} aktif öğrencinin ${overview.summary.studentsWithDecisionSafeEvidence} tanesinde karar güvenli kanıt var`}
              segments={[
                { label: 'Karar güvenli', value: overview.summary.studentsWithDecisionSafeEvidence, colorClass: 'text-emerald-400', barClass: 'bg-emerald-400' },
                { label: 'Kanıt yetersiz', value: overview.summary.studentsWithoutDecisionSafeEvidence, colorClass: 'text-amber-400', barClass: 'bg-amber-400' },
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <h3 className="text-sm font-black">Kazanım dağılımı</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Yeterli kanıtı oluşan öğrenci–kazanım sonuçlarının mevcut durumu.</p>
          <div className="mt-5">
            <SegmentedBar
              total={overview.summary.eligibleStudentOutcomeCount}
              ariaLabel={`${overview.summary.eligibleStudentOutcomeCount} ölçülen kazanımın ${overview.summary.masteredStudentOutcomeCount} tanesi güçlü, ${overview.summary.developingStudentOutcomeCount} tanesi gelişiyor`}
              segments={[
                { label: 'Güçlü', value: overview.summary.masteredStudentOutcomeCount, colorClass: 'text-emerald-400', barClass: 'bg-emerald-400' },
                { label: 'Gelişiyor', value: overview.summary.developingStudentOutcomeCount, colorClass: 'text-sky-400', barClass: 'bg-sky-400' },
              ]}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Aktif öğrenci" value={overview.summary.activeStudentCount} icon={<Users />} total={overview.summary.activeStudentCount} />
            <Metric label="Kanıt güvenli" value={overview.summary.studentsWithDecisionSafeEvidence} icon={<ShieldCheck />} total={overview.summary.activeStudentCount} />
            <Metric label="Destek ihtiyacı" value={overview.summary.studentsNeedingSupport} icon={<AlertTriangle />} tone="amber" total={overview.summary.activeStudentCount} />
            <Metric label="Kanıt yetersiz" value={overview.summary.studentsWithoutDecisionSafeEvidence} icon={<BarChart3 />} tone="muted" total={overview.summary.activeStudentCount} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
          <h3 className="flex items-center gap-2 text-sm font-black"><BookOpenCheck className="h-4 w-4 text-[var(--primary)]" /> Sınıf öncelikleri</h3>
          {overview.priorityOutcomes.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">En az üç öğrencide ortaklaşan, karar güvenli bir kazanım ihtiyacı henüz yok.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {overview.priorityOutcomes.map((outcome) => (
                <li key={outcome.code} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <span className="min-w-0 break-words text-sm font-bold">{outcome.title}</span>
                    <strong className="shrink-0 text-sm text-amber-200">%{outcome.averageScore}</strong>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-sub)]">{outcome.studentCount} öğrenci · {outcome.evidenceCount} kanıt</p>
                  <div className="mt-3">
                    <PercentBar value={outcome.averageScore} tone={outcome.averageScore < 60 ? 'amber' : 'sky'} label={`${outcome.title} sınıf ortalaması`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-black">Öğretmen takip göstergeleri</h3>
            <span className="text-[11px] font-bold text-[var(--text-sub)]">Tek puan ve sıralama yoktur</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(overview.teacherIndicators.dimensions).map(([key, indicator]) => {
              const evidence = indicator.evidence[0]
              return (
                <article key={key} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs font-bold text-[var(--text-sub)]">{indicatorLabels[key as keyof typeof indicatorLabels]}</p>
                  <strong className={`mt-1 block text-lg font-black ${indicator.value === null ? 'text-amber-200' : 'text-emerald-200'}`}>
                    {indicator.value === null ? 'Veri yetersiz' : `%${indicator.value}`}
                  </strong>
                  <div className="mt-2">
                    <PercentBar value={indicator.value} tone={indicator.value === null ? 'amber' : 'emerald'} label={indicatorLabels[key as keyof typeof indicatorLabels]} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-sub)]">
                    {evidence ? `${evidence.numerator}/${evidence.denominator} gözlem` : 'Kaynak henüz oluşturulmadı'} · {indicator.eligibleStudentCount} uygun öğrenci
                  </p>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value, icon, tone = 'primary', total }: {
  label: string; value: number; icon: React.ReactElement; tone?: 'primary' | 'amber' | 'muted'; total: number
}) {
  const tones = { primary: 'text-[var(--primary)]', amber: 'text-amber-300', muted: 'text-[var(--text-sub)]' }
  const ratio = total > 0 ? Math.round((value / total) * 100) : 0
  return <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-3"><span className={`block [&>svg]:h-4 [&>svg]:w-4 ${tones[tone]}`}>{icon}</span><div className="mt-2 flex items-end justify-between gap-1"><strong className="text-xl font-black leading-none">{value}</strong><span className="text-[10px] font-bold text-[var(--text-sub)]">%{ratio}</span></div><span className="mt-1 block truncate text-[11px] text-[var(--text-sub)]">{label}</span></div>
}

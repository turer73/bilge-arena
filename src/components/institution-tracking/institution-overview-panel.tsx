import Link from 'next/link'
import { AlertTriangle, ArrowRight, School, ShieldCheck, TrendingUp, Users } from 'lucide-react'

import type { InstitutionClassroomOverview } from '@/lib/institution-tracking/classroom-overview'
import type { InstitutionTrackingDirectory } from '@/lib/institution-tracking/directory'
import {
  TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS,
  TEACHER_GROWTH_MIN_WINDOW_DAYS,
  TEACHER_PROCESS_MIN_OBSERVATIONS,
} from '@/lib/institution-tracking/teacher-indicator-policy'

import { PercentBar } from './analytics-charts'

type OverviewMap = Record<string, InstitutionClassroomOverview | null>

const processLabels = {
  followUpDiscipline: 'Takip düzeni',
  programManagement: 'Program yönetimi',
  interventionResponsiveness: 'Müdahale etkinliği',
  dataReliability: 'Veri güvenilirliği',
} as const

export function InstitutionOverviewPanel({
  directory,
  overviews,
  loading,
  onOpenClassroom,
}: {
  directory: InstitutionTrackingDirectory
  overviews: OverviewMap
  loading: boolean
  onOpenClassroom?: (classroomId: string) => void
}) {
  const analyzableClassrooms = directory.classrooms.filter((classroom) => classroom.canAnalyze !== false)
  const pending = loading || (analyzableClassrooms.length > 0 && Object.keys(overviews).length === 0)
  const availableOverviews = analyzableClassrooms
    .map((classroom) => overviews[classroom.id])
    .filter((overview): overview is InstitutionClassroomOverview => Boolean(overview))
  const activeStudentCount = directory.classrooms.reduce((sum, classroom) => sum + classroom.activeStudentCount, 0)
  const decisionSafeCount = availableOverviews.reduce(
    (sum, overview) => sum + overview.summary.studentsWithDecisionSafeEvidence,
    0,
  )
  const supportNeedCount = availableOverviews.reduce(
    (sum, overview) => sum + overview.summary.studentsNeedingSupport,
    0,
  )
  const privacyReadyCount = directory.classrooms.filter((classroom) => classroom.activeStudentCount >= 3).length

  return (
    <div className="space-y-5">
      <section aria-labelledby="institution-overview-title" className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Kurum genel bakışı</p>
            <h2 id="institution-overview-title" className="mt-1 text-xl font-black sm:text-2xl">Bugünkü akademik görünüm</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-sub)]">Önce kurum ve sınıf düzeyi; ayrıntılı kanıt ve eylemler sınıf çalışma alanında gösterilir.</p>
          </div>
          <span className="w-fit rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-[var(--text-sub)]">
            {pending ? 'Sınıf özetleri doğrulanıyor…' : `${availableOverviews.length}/${analyzableClassrooms.length} sınıf özeti doğrulandı`}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewMetric label="Aktif sınıf" value={directory.classrooms.length} icon={<School />} />
          <OverviewMetric label="Aktif öğrenci" value={activeStudentCount} icon={<Users />} />
          <OverviewMetric label="Karar güvenli kanıt" value={pending ? '—' : decisionSafeCount} icon={<ShieldCheck />} />
          <OverviewMetric label="Destek ihtiyacı" value={pending ? '—' : supportNeedCount} icon={<AlertTriangle />} tone="amber" />
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--text-sub)]">
          {privacyReadyCount}/{directory.classrooms.length} sınıf toplu analiz için en az 3 aktif öğrenci eşiğini karşılıyor. Doğrulanamayan sınıflar kurum toplamlarına tahmin olarak eklenmez.
        </p>
      </section>

      <section aria-labelledby="institution-classrooms-title" className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <div>
          <h2 id="institution-classrooms-title" className="text-lg font-black sm:text-xl">Sınıflar ve öncelikler</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Bir sınıfa girerek öğrenci kanıtlarını, takipleri ve çalışma programlarını yönetin.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {directory.classrooms.map((classroom) => {
            const overview = overviews[classroom.id]
            const restricted = classroom.canAnalyze === false
            const belowThreshold = classroom.activeStudentCount < 3
            return (
              <article key={classroom.id} className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black">{classroom.name}</h3>
                    <p className="mt-1 truncate text-xs text-[var(--text-sub)]">{classroom.teacherAlias}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-xs font-bold">{classroom.activeStudentCount} öğrenci</span>
                </div>

                <div className="mt-4 min-h-20 rounded-lg border border-white/10 bg-black/5 p-3 text-xs leading-5">
                  {restricted ? (
                    <p className="text-sky-100">Bu rolde sınıf dizini görünür; ayrıntılı öğrenme analizi sınırlıdır.</p>
                  ) : overview ? (
                    <div className="space-y-1">
                      <p><strong>{overview.summary.studentsNeedingSupport}</strong> öğrenci destek odağında</p>
                      <p><strong>{overview.summary.studentsWithDecisionSafeEvidence}/{overview.summary.activeStudentCount}</strong> öğrencide karar güvenli kanıt</p>
                      <p className="truncate text-[var(--text-sub)]">{overview.priorityOutcomes[0]?.title ?? 'Ortak sınıf önceliği henüz oluşmadı'}</p>
                    </div>
                  ) : pending ? (
                    <p className="text-[var(--text-sub)]">Sınıf özeti doğrulanıyor…</p>
                  ) : belowThreshold ? (
                    <p className="text-amber-100">Toplu analiz için en az 3 aktif öğrenci gerekir.</p>
                  ) : (
                    <p className="text-amber-100">Sınıf özeti eksiksiz doğrulanamadı.</p>
                  )}
                </div>

                {onOpenClassroom ? (
                  <button
                    type="button"
                    onClick={() => onOpenClassroom(classroom.id)}
                    className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-black hover:bg-white/5"
                  >
                    Sınıf çalışma alanına git <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <Link
                    href={`/arena/kurum/sinif/${classroom.id}`}
                    className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-black hover:bg-white/5"
                  >
                    Sınıf çalışma alanına git <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {directory.membership.role === 'manager' && (
        <section aria-labelledby="teacher-overview-title" className="rounded-2xl border border-fuchsia-400/20 bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fuchsia-200"><TrendingUp className="h-4 w-4" aria-hidden="true" /> Kurum yöneticisi görünümü</p>
              <h2 id="teacher-overview-title" className="mt-1 text-xl font-black sm:text-2xl">Öğretmen takip göstergeleri</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Gelişim ve öğretmenin kontrolündeki süreç kayıtları ayrı gösterilir.</p>
            </div>
            <span className="w-fit rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold text-[var(--text-sub)]">Tek puan ve sıralama yoktur</span>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {directory.classrooms.map((classroom) => {
              const indicators = overviews[classroom.id]?.teacherIndicators
              return (
                <article key={classroom.id} className="rounded-xl border border-white/10 bg-gradient-to-br from-fuchsia-400/[0.06] to-transparent p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="truncate text-sm font-black">{classroom.teacherAlias}</h3><p className="mt-1 truncate text-xs text-[var(--text-sub)]">{classroom.name}</p></div>
                    <span className="shrink-0 text-xs text-[var(--text-sub)]">{classroom.activeStudentCount} öğrenci</span>
                  </div>
                  {!indicators ? (
                    <p className="mt-4 rounded-lg border border-amber-400/15 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
                      {pending ? 'Göstergeler doğrulanıyor…' : 'Karşılaştırılabilir öğretmen göstergesi için doğrulanmış sınıf verisi henüz yeterli değil.'}
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-3 text-xs"><span>Öğrenci gelişimi</span><strong>{indicators.dimensions.studentGrowth.value === null ? 'Henüz değerlendirilemez' : `%${indicators.dimensions.studentGrowth.value}`}</strong></div>
                        <div className="mt-2"><PercentBar value={indicators.dimensions.studentGrowth.value} tone={indicators.dimensions.studentGrowth.value === null ? 'amber' : 'emerald'} label={`${classroom.teacherAlias} öğrenci gelişimi`} /></div>
                        {indicators.dimensions.studentGrowth.value === null && <p className="mt-2 text-[11px] leading-4 text-[var(--text-sub)]">En az {TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS} uygun öğrenci ve {TEACHER_GROWTH_MIN_WINDOW_DAYS / 7} haftalık karşılaştırmalı kanıt gerekir.</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(processLabels).map(([key, label]) => {
                          const item = indicators.dimensions[key as keyof typeof processLabels]
                          return <div key={key} className="rounded-lg border border-white/10 bg-white/[0.025] p-2"><span className="block truncate text-[10px] text-[var(--text-sub)]">{label}</span><strong className="mt-1 block text-sm">{item.value === null ? 'Veri yetersiz' : `%${item.value}`}</strong>{item.value === null && <span className="mt-1 block text-[9px] text-[var(--text-sub)]">En az {TEACHER_PROCESS_MIN_OBSERVATIONS} gözlem</span>}</div>
                        })}
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] leading-5 text-[var(--text-sub)]">
            Göstergeler karar desteğidir; öğretmen sıralaması, tek performans puanı veya otomatik insan kaynakları kararı üretmez.
          </p>
        </section>
      )}
    </div>
  )
}

function OverviewMetric({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string
  value: number | string
  icon: React.ReactElement
  tone?: 'primary' | 'amber'
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className={`[&>svg]:h-4 [&>svg]:w-4 ${tone === 'amber' ? 'text-amber-300' : 'text-[var(--primary)]'}`} aria-hidden="true">{icon}</div>
      <strong className="mt-2 block text-2xl font-black">{value}</strong>
      <span className="mt-1 block text-xs text-[var(--text-sub)]">{label}</span>
    </div>
  )
}

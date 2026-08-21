import { Activity, ClipboardCheck, ShieldCheck, TrendingUp } from 'lucide-react'
import type { TeacherIndicatorSet } from '@/lib/institution-tracking/contracts'
import {
  TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS,
  TEACHER_GROWTH_MIN_WINDOW_DAYS,
  TEACHER_PROCESS_MIN_OBSERVATIONS,
} from '@/lib/institution-tracking/teacher-indicator-policy'
import { PercentBar } from './analytics-charts'

const operationalLabels = {
  followUpDiscipline: 'Takip düzeni',
  programManagement: 'Program yönetimi',
  interventionResponsiveness: 'Müdahale etkinliği',
  dataReliability: 'Veri güvenilirliği',
} as const

function evidenceText(indicator: TeacherIndicatorSet['dimensions']['studentGrowth']): string {
  const evidence = indicator.evidence[0]
  return evidence
    ? `${evidence.numerator}/${evidence.denominator} uygun gözlem · ${indicator.eligibleStudentCount} öğrenci`
    : 'Karşılaştırmalı kaynak henüz oluşmadı'
}

function growthExplanation(indicators: TeacherIndicatorSet): string {
  const growth = indicators.dimensions.studentGrowth
  const windowDays = (Date.parse(indicators.windowEnd) - Date.parse(indicators.windowStart)) / 86_400_000
  if (growth.eligibleStudentCount < TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS) {
    return `En az ${TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS} uygun öğrenci gerekir; şu an ${growth.eligibleStudentCount} öğrenci var.`
  }
  if (windowDays < TEACHER_GROWTH_MIN_WINDOW_DAYS) {
    return `En az ${TEACHER_GROWTH_MIN_WINDOW_DAYS / 7} haftalık karşılaştırmalı veri gerekir.`
  }
  return 'Güvenilir değerlendirme için karşılaştırmalı kanıt henüz yeterli değil.'
}

export function TeacherTrackingPanel({
  classroomName,
  teacherAlias,
  indicators,
}: {
  classroomName: string
  teacherAlias: string
  indicators: TeacherIndicatorSet
}) {
  const growth = indicators.dimensions.studentGrowth

  return (
    <section aria-label={`${teacherAlias} öğretmen takibi`} className="rounded-2xl border border-fuchsia-400/20 bg-[var(--surface)] p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-fuchsia-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Kurum yöneticisi görünümü
          </p>
          <h2 className="mt-1 text-xl font-black sm:text-2xl">Öğretmen Takibi</h2>
          <p className="mt-1 truncate text-sm text-[var(--text-sub)]">{teacherAlias} · {classroomName}</p>
        </div>
        <span className="w-fit rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold text-[var(--text-sub)]">
          Tek puan ve sıralama yoktur
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.2fr)]">
        <article className="rounded-xl border border-white/10 bg-gradient-to-br from-fuchsia-400/[0.08] to-transparent p-4">
          <p className="flex items-center gap-2 text-sm font-black"><TrendingUp className="h-4 w-4 text-fuchsia-200" aria-hidden="true" /> Öğrenci gelişimi</p>
          <strong className={`mt-3 block text-2xl font-black ${growth.value === null ? 'text-amber-200' : 'text-emerald-200'}`}>
            {growth.value === null ? 'Henüz değerlendirilemez' : `%${growth.value}`}
          </strong>
          <div className="mt-3">
            <PercentBar value={growth.value} tone={growth.value === null ? 'amber' : 'emerald'} label="Öğrenci gelişimi" />
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--text-sub)]">
            {growth.value === null ? growthExplanation(indicators) : evidenceText(growth)}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-[var(--text-sub)]">
            Sonuç, başlangıç seviyesi düzeltilmiş öğrenci gelişim kanıtıdır; öğretmenin tek başına başarısı olarak yorumlanmaz.
          </p>
        </article>

        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
            <h3 className="text-sm font-black">Süreç göstergeleri</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Öğretmenin kontrolündeki takip, program ve müdahale kayıtlarını ayrı ayrı gösterir.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(operationalLabels).map(([key, label]) => {
              const indicator = indicators.dimensions[key as keyof typeof operationalLabels]
              const evidence = indicator.evidence[0]
              return (
                <article key={key} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                  <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-sub)]"><Activity className="h-3.5 w-3.5" aria-hidden="true" /> {label}</p>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <strong className={`text-lg font-black ${indicator.value === null ? 'text-amber-200' : 'text-emerald-200'}`}>
                      {indicator.value === null ? 'Veri yetersiz' : `%${indicator.value}`}
                    </strong>
                    <span className="text-[10px] text-[var(--text-sub)]">{indicator.eligibleStudentCount} uygun</span>
                  </div>
                  <div className="mt-2">
                    <PercentBar value={indicator.value} tone={indicator.value === null ? 'amber' : 'emerald'} label={label} />
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-[var(--text-sub)]">
                    {evidence ? `${evidence.numerator}/${evidence.denominator} gözlem` : 'Kaynak henüz oluşmadı'}
                    {indicator.value === null ? ` · en az ${TEACHER_PROCESS_MIN_OBSERVATIONS} uygun gözlem gerekir` : ''}
                  </p>
                </article>
              )
            })}
          </div>
        </div>
      </div>

      <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] leading-5 text-[var(--text-sub)]">
        Bu göstergeler karar desteğidir; neden–sonuç iddiası, öğretmen sıralaması veya otomatik performans kararı üretmez.
      </p>
    </section>
  )
}

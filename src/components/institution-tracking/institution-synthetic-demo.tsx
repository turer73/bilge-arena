'use client'

import { useState } from 'react'
import {
  Building2,
  CheckCircle2,
  FileText,
  FlaskConical,
  UserRound,
} from 'lucide-react'

import type { InstitutionClassroomOverview } from '@/lib/institution-tracking/classroom-overview'

import { ClassroomOverviewPanel } from './classroom-overview-panel'
import { TeacherTrackingPanel } from './teacher-tracking-panel'

const students = [
  {
    alias: 'Sede Dilara Ürer',
    status: 'Gelişiyor',
    focus: 'Temel Kavramlar',
    score: 58,
    evidence: 14,
  },
  {
    alias: 'Demo Öğrenci İki',
    status: 'Güçlü',
    focus: 'Sayı Basamakları',
    score: 86,
    evidence: 19,
  },
  {
    alias: 'Demo Öğrenci Üç',
    status: 'Kanıt yetersiz',
    focus: 'Rasyonel Sayılar',
    score: null,
    evidence: 2,
  },
  {
    alias: 'Demo Öğrenci Dört',
    status: 'Gelişiyor',
    focus: 'Bölme ve Bölünebilme',
    score: 64,
    evidence: 11,
  },
]

function indicator(value: number | null, numerator: number, denominator: number) {
  return {
    status: value === null ? 'insufficient' as const : 'available' as const,
    value,
    eligibleStudentCount: 4,
    excludedInsufficientCount: 0,
    evidence: [{ code: 'synthetic_demo', numerator, denominator }],
  }
}

const overview: InstitutionClassroomOverview = {
  classroom: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'TYT Matematik A',
    teacherAlias: 'Demo Öğretmen',
    activeStudentCount: 4,
  },
  scope: {
    game: 'matematik',
    examRef: 'TYT',
    taxonomyVersion: 'ba-tyt-math-v1',
    modelVersion: 'institution-classroom-overview-v1',
    windowStart: '2026-07-17T00:00:00.000Z',
    windowEnd: '2026-08-14T00:00:00.000Z',
    minimumGroupSize: 3,
  },
  summary: {
    activeStudentCount: 4,
    studentsWithDecisionSafeEvidence: 3,
    studentsNeedingSupport: 2,
    studentsWithoutDecisionSafeEvidence: 1,
    eligibleStudentOutcomeCount: 28,
    developingStudentOutcomeCount: 9,
    masteredStudentOutcomeCount: 19,
  },
  priorityOutcomes: [
    {
      code: 'DEMO-01',
      title: 'Temel Kavramlar',
      studentCount: 3,
      evidenceCount: 31,
      averageScore: 59.3,
    },
  ],
  teacherIndicators: {
    modelVersion: 'institution-teacher-indicators-v2',
    windowStart: '2026-07-17T00:00:00.000Z',
    windowEnd: '2026-08-14T00:00:00.000Z',
    dimensions: {
      studentGrowth: indicator(null, 3, 4),
      followUpDiscipline: indicator(100, 3, 3),
      programManagement: indicator(66.7, 2, 3),
      interventionResponsiveness: indicator(66.7, 2, 3),
      dataReliability: indicator(75, 3, 4),
    },
  },
}

export function InstitutionSyntheticDemo() {
  const [selected, setSelected] = useState(0)
  const [followup, setFollowup] = useState(false)
  const [program, setProgram] = useState(false)
  const [report, setReport] = useState(false)
  const student = students[selected]

  function selectStudent(index: number) {
    setSelected(index)
    setFollowup(false)
    setProgram(false)
    setReport(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-fuchsia-200">
            <FlaskConical className="h-4 w-4" /> Sentetik demo verisi
          </p>
          <p className="mt-1 text-xs text-[var(--text-sub)]">
            Gerçek hesap, öğrenci verisi veya production yazması kullanılmaz.
            Eylemler yalnız bu ekranın belleğinde çalışır.
          </p>
        </div>
        <span className="w-fit rounded-lg bg-fuchsia-300/10 px-3 py-2 text-xs font-bold">
          Demo Kurumu · 4 öğrenci
        </span>
      </div>

      <header className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--primary)]">
          <Building2 className="h-4 w-4" /> Bilge Arena Kurumsal
        </p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          Küçük Dershane Takip Demosu
        </h1>
      </header>

      <ClassroomOverviewPanel overview={overview} />

      {overview.teacherIndicators && (
        <TeacherTrackingPanel
          classroomName={overview.classroom.name}
          teacherAlias={overview.classroom.teacherAlias}
          indicators={overview.teacherIndicators}
        />
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-white/10 bg-[var(--surface)] p-3">
          <h2 className="px-2 pb-2 text-xs font-black uppercase tracking-widest text-[var(--text-sub)]">
            Öğrenciler
          </h2>
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {students.map((item, index) => (
              <button
                key={item.alias}
                type="button"
                aria-pressed={selected === index}
                onClick={() => selectStudent(index)}
                className={`min-w-[13rem] rounded-xl border p-3 text-left lg:min-w-0 ${
                  selected === index
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-white/10'
                }`}
              >
                <span className="block truncate text-sm font-black">
                  {item.alias}
                </span>
                <span className="mt-1 block text-xs text-[var(--text-sub)]">
                  {item.status}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--primary)]">
                Öğrenci durum tespiti
              </p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">
                {student.alias}
              </h2>
            </div>
            <UserRound className="h-7 w-7 text-[var(--primary)]" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DemoMetric label="Durum" value={student.status} />
            <DemoMetric label="Odak" value={student.focus} />
            <DemoMetric
              label="Skor"
              value={student.score === null ? '—' : `%${student.score}`}
            />
            <DemoMetric label="Kanıt" value={String(student.evidence)} />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <DemoAction
              active={followup}
              onClick={() => setFollowup(!followup)}
              label={followup ? 'Takip açık' : 'Takip aç'}
              icon={<CheckCircle2 />}
            />
            <DemoAction
              active={program}
              onClick={() => setProgram(!program)}
              label={program ? 'Program yayınlandı' : 'Program hazırla'}
              icon={<FileText />}
            />
            <DemoAction
              active={report}
              onClick={() => setReport(!report)}
              label={report ? 'Rapor hazır' : 'Rapor oluştur'}
              icon={<FileText />}
            />
          </div>

          {(followup || program || report) && (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-100">
              {followup && <p>✓ Öğrenme desteği takibi açıldı.</p>}
              {program && (
                <p>✓ Öğretmen onaylı haftalık program hazırlandı.</p>
              )}
              {report && (
                <p>✓ Kimlik-minimal durum raporu snapshotı hazırlandı.</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function DemoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 p-3">
      <span className="block text-xs text-[var(--text-sub)]">{label}</span>
      <strong className="mt-1 block break-words text-sm">{value}</strong>
    </div>
  )
}

function DemoAction({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactElement
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold ${
        active
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
          : 'border-white/15'
      }`}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  )
}

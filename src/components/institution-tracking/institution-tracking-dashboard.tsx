'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  RefreshCw,
  Send,
  Save,
  Trash2,
  Printer,
  Mail,
  ClipboardCheck,
  Plus,
  School,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { TR_TIME_ZONE } from '@/lib/utils/tr-date'
import {
  fetchInstitutionStudentLearningAnalysis,
  fetchInstitutionClassroomOverview,
  fetchInstitutionLearningScopes,
  fetchInstitutionTrackingDirectory,
  createInstitutionStudyProgramDraft,
  publishInstitutionStudyProgram,
  updateInstitutionStudyProgramDraft,
  InstitutionTrackingClientError,
  isInstitutionTrackingUiEnabled,
} from '@/lib/institution-tracking/client'
import type { InstitutionLearningScope } from '@/lib/institution-tracking/scope'
import { GAMES } from '@/lib/constants/games'
import type { InstitutionTrackingDirectory } from '@/lib/institution-tracking/directory'
import type { InstitutionStudentLearningAnalysis } from '@/lib/institution-tracking/student-analysis'
import type { InstitutionStudyProgramDraftResponse } from '@/lib/institution-tracking/study-program'
import type { InstitutionClassroomOverview } from '@/lib/institution-tracking/classroom-overview'
import { ClassroomOverviewPanel } from './classroom-overview-panel'
import { buildGuardianStatusEmailDraft } from '@/lib/institution-tracking/guardian-email-draft'
import { StudentFollowupPanel } from './student-followup-panel'
import { ProgramReviewPanel } from './program-review-panel'
import { StudentReportPanel } from './student-report-panel'
import { InstitutionClassroomCreatePanel } from './institution-classroom-create-panel'
import { InstitutionPanelNav } from './institution-panel-nav'
import { InstitutionStudentInviteDialog } from './institution-student-invite-dialog'
import { EvidenceDistributionChart, PercentBar } from './analytics-charts'
import { InstitutionOverviewPanel } from './institution-overview-panel'
import type { InstitutionInitialScope } from '@/app/arena/kurum/scope-query'

const statusCopy = {
  insufficient: { label: 'Kanıt yetersiz', className: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
  developing: { label: 'Gelişiyor', className: 'border-sky-400/30 bg-sky-400/10 text-sky-200' },
  mastered: { label: 'Güçlü', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' },
} as const

const confidenceCopy = {
  insufficient: 'Yetersiz',
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
} as const

function formatDate(value: string | null): string {
  if (!value) return 'Henüz kanıt yok'
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TR_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function nextMonday(): string {
  const date = new Date()
  const days = (8 - date.getUTCDay()) % 7 || 7
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]" aria-label="Kurum takibi yükleniyor">
      <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
    </div>
  )
}

export function InstitutionTrackingDashboard({
  initialClassroomId,
  initialMemberRef,
  initialScope,
}: {
  initialClassroomId?: string
  initialMemberRef?: string
  initialScope?: InstitutionInitialScope
} = {}) {
  const enabled = isInstitutionTrackingUiEnabled()
  const classroomPage = Boolean(initialClassroomId)
  const [directory, setDirectory] = useState<InstitutionTrackingDirectory | null>(null)
  const [learningScopes, setLearningScopes] = useState<InstitutionLearningScope[]>([])
  const [selectedScopeKey, setSelectedScopeKey] = useState<string | null>(null)
  const [scopeLoading, setScopeLoading] = useState(enabled)
  const [scopeError, setScopeError] = useState(false)
  const [requestedScopeUnavailable, setRequestedScopeUnavailable] = useState(false)
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null)
  const [selectedMemberRef, setSelectedMemberRef] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<InstitutionStudentLearningAnalysis | null>(null)
  const [classroomOverview, setClassroomOverview] = useState<InstitutionClassroomOverview | null>(null)
  const [classroomOverviewLoading, setClassroomOverviewLoading] = useState(false)
  const [classroomOverviewError, setClassroomOverviewError] = useState(false)
  const [institutionOverviews, setInstitutionOverviews] = useState<Record<string, InstitutionClassroomOverview | null>>({})
  const [institutionOverviewsLoading, setInstitutionOverviewsLoading] = useState(false)
  const [directoryLoading, setDirectoryLoading] = useState(enabled)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [classroomCreatorOpen, setClassroomCreatorOpen] = useState(false)
  const [classroomAnnouncement, setClassroomAnnouncement] = useState<string | null>(null)
  const [studentInviteOpen, setStudentInviteOpen] = useState(false)
  const classroomCreatorButtonRef = useRef<HTMLButtonElement | null>(null)
  const initialScopeKey = initialScope ? `${initialScope.game}:${initialScope.displayExamRef}` : null

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    queueMicrotask(async () => {
      setScopeLoading(true)
      setScopeError(false)
      setRequestedScopeUnavailable(false)
      try {
        const next = await fetchInstitutionLearningScopes(controller.signal)
        if (controller.signal.aborted) return
        setLearningScopes(next.scopes)
        const available = new Set(next.scopes.map((scope) => `${scope.game}:${scope.displayExamRef}`))
        if (initialScopeKey && !available.has(initialScopeKey)) {
          setRequestedScopeUnavailable(true)
          setSelectedScopeKey(null)
        } else {
          setSelectedScopeKey((current) => (
            initialScopeKey
              ?? (current && available.has(current)
                ? current
                : next.scopes[0] ? `${next.scopes[0].game}:${next.scopes[0].displayExamRef}` : null)
          ))
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLearningScopes([])
        setSelectedScopeKey(null)
        setScopeError(true)
      } finally {
        if (!controller.signal.aborted) setScopeLoading(false)
      }
    })
    return () => controller.abort()
  }, [enabled, initialScopeKey, refreshKey])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    queueMicrotask(async () => {
      setDirectoryLoading(true)
      setErrorStatus(null)
      try {
        const next = await fetchInstitutionTrackingDirectory(controller.signal)
        if (controller.signal.aborted) return
        setDirectory(next)
        setSelectedClassroomId(initialClassroomId && next.classrooms.some((classroom) => classroom.id === initialClassroomId)
          ? initialClassroomId
          : null)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setDirectory(null)
        setErrorStatus(error instanceof InstitutionTrackingClientError ? error.status : 500)
      } finally {
        if (!controller.signal.aborted) setDirectoryLoading(false)
      }
    })
    return () => controller.abort()
  }, [enabled, initialClassroomId, refreshKey])

  const selectedClassroom = useMemo(() => directory?.classrooms.find(
    (classroom) => classroom.id === selectedClassroomId,
  ) ?? null, [directory, selectedClassroomId])
  const selectedLearningScope = useMemo(() => learningScopes.find(
    (scope) => `${scope.game}:${scope.displayExamRef}` === selectedScopeKey,
  ) ?? null, [learningScopes, selectedScopeKey])
  const canAnalyzeSelectedClassroom = selectedClassroom?.canAnalyze !== false
  const canInviteStudents = classroomPage && selectedClassroom?.canManagePrograms === true

  useEffect(() => {
    setStudentInviteOpen(false)
  }, [selectedClassroomId])

  useEffect(() => {
    if (!selectedClassroom) {
      setSelectedMemberRef(null)
      return
    }
    setSelectedMemberRef((current) => {
      if (initialMemberRef && selectedClassroom.students.some((student) => student.memberRef === initialMemberRef)) {
        return initialMemberRef
      }
      return current && selectedClassroom.students.some((student) => student.memberRef === current)
        ? current
        : selectedClassroom.students[0]?.memberRef ?? null
    })
  }, [initialMemberRef, selectedClassroom])

  useEffect(() => {
    if (classroomPage || !directory || !selectedLearningScope || directory.classrooms.length === 0) {
      setInstitutionOverviews({})
      setInstitutionOverviewsLoading(false)
      return
    }
    const controller = new AbortController()
    setInstitutionOverviews({})
    queueMicrotask(async () => {
      setInstitutionOverviewsLoading(true)
      const analyzable = directory.classrooms.filter((classroom) => (
        classroom.canAnalyze !== false && classroom.activeStudentCount >= 3
      ))
      const entries = await Promise.all(analyzable.map(async (classroom) => {
        try {
          const overview = await fetchInstitutionClassroomOverview(
            classroom.id,
            selectedLearningScope,
            controller.signal,
          )
          return [classroom.id, overview] as const
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null
          return [classroom.id, null] as const
        }
      }))
      if (!controller.signal.aborted) {
        setInstitutionOverviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, InstitutionClassroomOverview | null] => entry !== null)))
        setInstitutionOverviewsLoading(false)
      }
    })
    return () => controller.abort()
  }, [classroomPage, directory, refreshKey, selectedLearningScope])

  useEffect(() => {
    if (!classroomPage || !selectedClassroomId || !selectedLearningScope || !canAnalyzeSelectedClassroom) {
      setClassroomOverview(null)
      setClassroomOverviewError(false)
      return
    }
    const controller = new AbortController()
    setClassroomOverview(null)
    queueMicrotask(async () => {
      setClassroomOverviewLoading(true)
      setClassroomOverviewError(false)
      try {
        const next = await fetchInstitutionClassroomOverview(
          selectedClassroomId,
          selectedLearningScope,
          controller.signal,
        )
        if (!controller.signal.aborted) setClassroomOverview(next)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (!controller.signal.aborted) {
          setClassroomOverview(null)
          setClassroomOverviewError(true)
        }
      } finally {
        if (!controller.signal.aborted) setClassroomOverviewLoading(false)
      }
    })
    return () => controller.abort()
  }, [canAnalyzeSelectedClassroom, classroomPage, selectedClassroomId, refreshKey, selectedLearningScope])

  useEffect(() => {
    if (!classroomPage || !selectedClassroomId || !selectedMemberRef || !selectedLearningScope || !canAnalyzeSelectedClassroom) {
      setAnalysis(null)
      setAnalysisLoading(false)
      return
    }
    const controller = new AbortController()
    setAnalysis(null)
    queueMicrotask(async () => {
      setAnalysisLoading(true)
      try {
        const next = await fetchInstitutionStudentLearningAnalysis(
          selectedClassroomId,
          selectedMemberRef,
          selectedLearningScope,
          controller.signal,
        )
        if (!controller.signal.aborted) {
          setAnalysis(next)
          setErrorStatus(null)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setAnalysis(null)
        setErrorStatus(error instanceof InstitutionTrackingClientError ? error.status : 500)
      } finally {
        if (!controller.signal.aborted) setAnalysisLoading(false)
      }
    })
    return () => controller.abort()
  }, [canAnalyzeSelectedClassroom, classroomPage, selectedClassroomId, selectedMemberRef, refreshKey, selectedLearningScope])

  function closeClassroomCreator() {
    setClassroomCreatorOpen(false)
    window.setTimeout(() => classroomCreatorButtonRef.current?.focus(), 0)
  }

  if (!enabled) {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[var(--surface)] p-6 text-center sm:p-10">
        <ShieldCheck className="mx-auto h-10 w-10 text-[var(--primary)]" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-black">Kurum takibi kontrollü pilotta</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">
          Öğrenci analizi yalnız onaylı kurum, sınıf ve öğretmen kapsamı açıldığında kullanılabilir.
        </p>
      </section>
    )
  }

  if (directoryLoading && !directory) return <DashboardSkeleton />

  if (!directory) {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-center sm:p-10">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-300" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">Kurum çalışma alanı alınamadı</h1>
        <p className="mt-2 text-sm text-[var(--text-sub)]">
          {errorStatus === 403 ? 'Bu hesap için aktif kurum yetkisi bulunamadı.' : 'Bağlantıyı ve pilot ayarlarını kontrol edip yeniden deneyin.'}
        </p>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
        </button>
      </section>
    )
  }

  if (classroomPage && !selectedClassroom) {
    return (
      <div className="space-y-5">
        <InstitutionPanelNav canManageRoles={directory.membership.role === 'manager'} />
        <section className="mx-auto max-w-3xl rounded-2xl border border-amber-400/20 bg-[var(--surface)] p-6 text-center sm:p-10">
          <School className="mx-auto h-10 w-10 text-amber-300" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-black">Sınıf çalışma alanı bulunamadı</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">
            Bu sınıf aktif olmayabilir veya hesabınız bu kurum sınıfını görmeye yetkili olmayabilir.
          </p>
          <Link
            href="/arena/kurum"
            className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kurum genel bakışına dön
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <InstitutionPanelNav canManageRoles={directory.membership.role === 'manager'} />
      <header className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
              {classroomPage ? (
                <><School className="h-4 w-4 shrink-0" aria-hidden="true" /> Sınıf Çalışma Alanı</>
              ) : (
                <><Building2 className="h-4 w-4 shrink-0" aria-hidden="true" /> Kurum Paneli</>
              )}
            </div>
            <h1 className="mt-2 truncate text-2xl font-black sm:text-3xl">
              {classroomPage ? selectedClassroom?.name : directory.institution.name}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-sub)]">
              {classroomPage && selectedClassroom
                ? `${directory.institution.name} · ${selectedClassroom.teacherAlias} · ${selectedClassroom.activeStudentCount} öğrenci`
                : <>{directory.membership.role === 'manager'
                    ? directory.membership.teacherEnabled
                      ? 'Kurum yöneticisi ve öğretmen görünümü'
                      : 'Kurum yöneticisi görünümü'
                    : 'Öğretmen görünümü'} · Açıklanabilir öğrenci takibi</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {classroomPage ? (
              <>
                <Link
                  href={selectedLearningScope
                    ? `/arena/kurum?game=${encodeURIComponent(selectedLearningScope.game)}&exam_ref=${encodeURIComponent(selectedLearningScope.displayExamRef)}`
                    : '/arena/kurum'}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black hover:bg-white/5"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Genel bakış
                </Link>
                {canInviteStudents && (
                  <button
                    type="button"
                    onClick={() => setStudentInviteOpen(true)}
                    className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black"
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" /> Öğrenci ekle
                  </button>
                )}
              </>
            ) : directory.membership.role === 'manager' && (
              <>
                <button
                  ref={classroomCreatorButtonRef}
                  type="button"
                  onClick={() => {
                    setClassroomCreatorOpen((current) => !current)
                    setClassroomAnnouncement(null)
                  }}
                  aria-expanded={classroomCreatorOpen}
                  className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Sınıf oluştur
                </button>
              </>
            )}
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Doğrulanmış kanıt
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label htmlFor="institution-learning-scope" className="text-xs font-black uppercase tracking-[0.12em] text-[var(--text-sub)]">
              Öğrenme analizi kapsamı
            </label>
            <p className="mt-1 text-[11px] leading-4 text-[var(--text-sub)]">
              Yalnız veri bütünlüğü ve kurum raporlama kapısı doğrulanan dersler listelenir.
            </p>
          </div>
          {requestedScopeUnavailable ? (
            <span role="alert" className="text-xs font-bold text-amber-200">
              İstenen analiz kapsamı yayımlanmamış.
            </span>
          ) : scopeLoading ? (
            <span className="text-xs font-bold text-[var(--text-sub)]">Kapsamlar doğrulanıyor…</span>
          ) : learningScopes.length > 0 ? (
            <select
              id="institution-learning-scope"
              value={selectedScopeKey ?? ''}
              onChange={(event) => setSelectedScopeKey(event.target.value)}
              className="min-h-11 rounded-xl border border-white/15 bg-[var(--surface)] px-3 text-sm font-bold"
            >
              {learningScopes.map((scope) => (
                <option key={`${scope.game}:${scope.displayExamRef}`} value={`${scope.game}:${scope.displayExamRef}`}>
                  {scope.displayExamRef} · {GAMES[scope.game].name}
                </option>
              ))}
            </select>
          ) : (
            <span role={scopeError ? 'alert' : 'status'} className="text-xs font-bold text-amber-200">
              Doğrulanmış kurum analiz kapsamı bulunamadı.
            </span>
          )}
        </div>
      </header>

      {selectedClassroom && (
        <InstitutionStudentInviteDialog
          classroomId={selectedClassroom.id}
          classroomName={selectedClassroom.name}
          open={studentInviteOpen}
          onOpenChange={setStudentInviteOpen}
        />
      )}

      {!classroomPage && directory.membership.role === 'manager' && classroomCreatorOpen && (
        <InstitutionClassroomCreatePanel
          onCancel={closeClassroomCreator}
          onCreated={(result) => {
            setClassroomAnnouncement(`${result.classroom.name}, ${result.teacher.alias} öğretmenine atandı.`)
            closeClassroomCreator()
            setRefreshKey((value) => value + 1)
          }}
        />
      )}

      {!classroomPage && classroomAnnouncement && (
        <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm font-bold text-emerald-200">
          {classroomAnnouncement}
        </p>
      )}

      {!classroomPage && directory.classrooms.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-[var(--surface)] p-8 text-center">
          <Users className="mx-auto h-9 w-9 text-[var(--text-sub)]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-black">Aktif sınıf bulunamadı</h2>
          <p className="mt-2 text-sm text-[var(--text-sub)]">İlk sınıfı kurumunuzdaki aktif bir öğretmene atayarak başlayın.</p>
          {directory.membership.role === 'manager' && (
            <button
              type="button"
              onClick={() => {
                classroomCreatorButtonRef.current?.focus()
                setClassroomCreatorOpen(true)
                setClassroomAnnouncement(null)
              }}
              className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> İlk sınıfı oluştur
            </button>
          )}
        </section>
      ) : !classroomPage ? (
          <InstitutionOverviewPanel
            directory={directory}
            overviews={institutionOverviews}
            loading={institutionOverviewsLoading}
            selectedScope={selectedLearningScope}
        />
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            {selectedClassroom && (
              <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-3">
                <h2 className="px-2 pb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-sub)]">Öğrenciler</h2>
                {selectedClassroom.students.length === 0 ? (
                  <p className="rounded-xl bg-white/[0.03] p-3 text-sm text-[var(--text-sub)]">
                    {canInviteStudents
                      ? 'Bu sınıfta aktif öğrenci yok. Öğrenci ekle düğmesiyle güvenli katılım bağlantısı oluşturun.'
                      : 'Bu sınıfta görünür aktif öğrenci yok.'}
                  </p>
                ) : (
                  <div className="flex max-h-80 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible" aria-label="Sınıf öğrencileri">
                    {selectedClassroom.students.map((student) => {
                      const selected = student.memberRef === selectedMemberRef
                      return (
                        <Link
                          key={student.memberRef}
                          href={buildClassroomHref(selectedClassroom.id, selectedLearningScope, student.memberRef)}
                          aria-current={selected ? 'true' : undefined}
                          className={`flex min-w-[13rem] items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left lg:min-w-0 ${selected
                            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                            : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{student.alias}</span>
                            <span className="mt-0.5 block text-xs text-[var(--text-sub)]">Katılım {formatDate(student.joinedAt)}</span>
                          </span>
                          <span className="text-xs font-black text-[var(--primary)]">Aç</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </aside>

          <main className="min-w-0 space-y-4" aria-live="polite">
            {!canAnalyzeSelectedClassroom ? (
              <section className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" aria-hidden="true" />
                  <div>
                    <h2 className="text-base font-black">Dizin erişimi açık, öğrenme analizi sınırlı</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Atanan kurum rolü bu sınıfın kadro ve öğrenci dizinini görmenizi sağlar. Ayrıntılı kazanım analizi, program ve rapor işlemleri sınıfın kendi öğretmeni ile kurum yöneticisinde kalır.</p>
                  </div>
                </div>
              </section>
            ) : classroomOverviewLoading && !classroomOverview ? (
              <div className="h-64 animate-pulse rounded-2xl bg-white/5" aria-label="Sınıf özeti yükleniyor" />
            ) : classroomOverview ? (
              <ClassroomOverviewPanel overview={classroomOverview} />
            ) : classroomOverviewError && (selectedClassroom?.activeStudentCount ?? 0) < 3 ? (
              <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                Toplu sınıf grafikleri için en az 3 aktif öğrenci gerekir. Öğrenci analizi ayrı olarak kullanılabilir.
              </section>
            ) : classroomOverviewError ? (
              <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                Sınıf özeti eksiksiz doğrulanamadığı için gösterilmiyor. Öğrenci analizi ayrı olarak kullanılabilir.
              </section>
            ) : null}
            {!canAnalyzeSelectedClassroom ? null : requestedScopeUnavailable ? (
              <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-black">İstenen analiz kapsamı yayımlanmamış</h2>
                <p className="mt-2 text-sm text-[var(--text-sub)]">
                  Bu bağlantıdaki ders kapsamı artık kurum analizi için doğrulanmış yayımlar arasında değil.
                </p>
              </section>
            ) : !selectedLearningScope ? (
              <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-black">Doğrulanmış analiz kapsamı yok</h2>
                <p className="mt-2 text-sm text-[var(--text-sub)]">
                  Veri bütünlüğü ve kurum raporlama kapısı geçmeyen dersler öğrenci analizi olarak açılmaz.
                </p>
              </section>
            ) : !selectedMemberRef ? (
              <section className="rounded-2xl border border-dashed border-white/15 bg-[var(--surface)] p-8 text-center">
                <Users className="mx-auto h-9 w-9 text-[var(--text-sub)]" aria-hidden="true" />
                <p className="mt-3 text-sm text-[var(--text-sub)]">Analiz için aktif bir öğrenci seçin.</p>
              </section>
            ) : analysisLoading ? (
              <div className="h-96 animate-pulse rounded-2xl bg-white/5" aria-label="Öğrenci analizi yükleniyor" />
            ) : !analysis ? (
              <section className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-red-300" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-black">Öğrenci analizi alınamadı</h2>
                <p className="mt-2 text-sm text-[var(--text-sub)]">
                  {errorStatus === 400
                    ? 'Bu ders kapsamı henüz güvenilir analiz için desteklenmiyor.'
                    : 'Yetki, migration ve pilot ayarlarını kontrol edip yeniden deneyin.'}
                </p>
                <button
                  type="button"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  className="btn-primary mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
                </button>
              </section>
            ) : (
              <AnalysisPanel
                analysis={analysis}
                classroomId={selectedClassroomId!}
                canManagePrograms={selectedClassroom?.canManagePrograms === true
                  && selectedLearningScope.game === 'matematik'
                  && selectedLearningScope.displayExamRef === 'TYT'}
                onFollowupChanged={() => setRefreshKey((value) => value + 1)}
              />
            )}
          </main>
        </div>
      )}
    </div>
  )
}

function buildClassroomHref(
  classroomId: string,
  scope: InstitutionLearningScope | null,
  memberRef?: string,
): string {
  const params = new URLSearchParams()
  if (memberRef) params.set('ogrenci', memberRef)
  if (scope) {
    params.set('game', scope.game)
    params.set('exam_ref', scope.displayExamRef)
  }
  const query = params.toString()
  return `/arena/kurum/sinif/${classroomId}${query ? `?${query}` : ''}`
}

function AnalysisPanel({
  analysis,
  classroomId,
  canManagePrograms,
  onFollowupChanged,
}: {
  analysis: InstitutionStudentLearningAnalysis
  classroomId: string
  canManagePrograms: boolean
  onFollowupChanged: () => void
}) {
  const [program, setProgram] = useState<InstitutionStudyProgramDraftResponse | null>(null)
  const [programBusy, setProgramBusy] = useState(false)
  const [programError, setProgramError] = useState<string | null>(null)
  const [programDirty, setProgramDirty] = useState(false)
  const [emailDraftStatus, setEmailDraftStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const guardianEmailDraft = useMemo(() => buildGuardianStatusEmailDraft(analysis), [analysis])

  useEffect(() => {
    setProgram(null)
    setProgramError(null)
    setProgramDirty(false)
  }, [analysis.student.memberRef])

  async function createProgram() {
    setProgramBusy(true); setProgramError(null)
    try {
      setProgram(await createInstitutionStudyProgramDraft({
        classroomId, memberRef: analysis.student.memberRef, weekStart: nextMonday(), dailyMinuteLimit: 45,
      }))
      setProgramDirty(false)
    } catch (error) {
      setProgramError(error instanceof InstitutionTrackingClientError && error.status === 409
        ? 'Bu hafta için taslak zaten var veya güvenilir kapsam yetersiz.'
        : 'Program taslağı oluşturulamadı.')
    } finally { setProgramBusy(false) }
  }

  async function publishProgram() {
    if (!program || programDirty) return
    setProgramBusy(true); setProgramError(null)
    try {
      const published = await publishInstitutionStudyProgram(program.program.programRef)
      setProgram({ ...program, program: published })
    } catch { setProgramError('Program yayınlanamadı.') }
    finally { setProgramBusy(false) }
  }

  function removeProgramItem(position: number) {
    if (!program || program.program.status !== 'draft' || program.draft.items.length <= 1) return
    const items = program.draft.items
      .filter((item) => item.position !== position)
      .map((item, index) => ({ ...item, position: index + 1 }))
    setProgram({ ...program, draft: { ...program.draft, items } })
    setProgramDirty(true)
    setProgramError(null)
  }

  async function saveProgram() {
    if (!program || !programDirty || program.program.status !== 'draft') return
    setProgramBusy(true); setProgramError(null)
    try {
      const updated = await updateInstitutionStudyProgramDraft(program.program.programRef, {
        weekStart: program.draft.weekStart,
        dailyMinuteLimit: program.draft.dailyMinuteLimit,
        items: program.draft.items,
      })
      setProgram({ ...program, program: updated })
      setProgramDirty(false)
    } catch { setProgramError('Program değişiklikleri kaydedilemedi.') }
    finally { setProgramBusy(false) }
  }

  async function copyGuardianEmailDraft() {
    if (!guardianEmailDraft) return
    try {
      await navigator.clipboard.writeText(`Konu: ${guardianEmailDraft.subject}\n\n${guardianEmailDraft.body}`)
      setEmailDraftStatus('copied')
    } catch { setEmailDraftStatus('error') }
  }

  function printProgram() {
    document.body.classList.add('institution-program-print-page')
    try { window.print() }
    finally { document.body.classList.remove('institution-program-print-page') }
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">Öğrenci durum tespiti</p>
            <h2 className="mt-1 truncate text-xl font-black sm:text-2xl">{analysis.student.alias}</h2>
            <p className="mt-1 text-sm text-[var(--text-sub)]">
              {analysis.scope.examRef} · {GAMES[analysis.scope.game].name} · {analysis.scope.taxonomyVersion}
            </p>
          </div>
          <div className="text-xs text-[var(--text-sub)] sm:text-right">
            <span className="block">Kanıt başlangıcı</span>
            <strong className="mt-1 block text-[var(--text)]">{formatDate(analysis.scope.windowStart)}</strong>
          </div>
        </div>

        <div className="mt-5 grid gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.045] to-transparent p-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <h3 className="text-sm font-black">Kazanım durumu</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Ölçülen ve kanıt bekleyen kazanımların görsel dağılımı.</p>
            <div className="mt-4">
              <EvidenceDistributionChart
                total={analysis.summary.outcomeCount}
                centerValue={analysis.summary.assessedOutcomeCount}
                centerLabel="ölçülen"
                ariaLabel={`${analysis.summary.outcomeCount} kazanımın ${analysis.summary.masteredOutcomeCount} tanesi güçlü, ${analysis.summary.developingOutcomeCount} tanesi gelişiyor ve ${analysis.summary.insufficientOutcomeCount} tanesinde kanıt yetersiz`}
                segments={[
                  { label: 'Güçlü', value: analysis.summary.masteredOutcomeCount, colorClass: 'text-emerald-400', barClass: 'bg-emerald-400' },
                  { label: 'Gelişiyor', value: analysis.summary.developingOutcomeCount, colorClass: 'text-sky-400', barClass: 'bg-sky-400' },
                  { label: 'Kanıt yetersiz', value: analysis.summary.insufficientOutcomeCount, colorClass: 'text-amber-400', barClass: 'bg-amber-400' },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SummaryCard label="Ölçülen" value={analysis.summary.assessedOutcomeCount} total={analysis.summary.outcomeCount} icon={<BarChart3 />} />
            <SummaryCard label="Güçlü" value={analysis.summary.masteredOutcomeCount} total={analysis.summary.outcomeCount} tone="emerald" icon={<BookOpenCheck />} />
            <SummaryCard label="Gelişiyor" value={analysis.summary.developingOutcomeCount} total={analysis.summary.outcomeCount} tone="sky" icon={<BarChart3 />} />
            <SummaryCard label="Kanıt yetersiz" value={analysis.summary.insufficientOutcomeCount} total={analysis.summary.outcomeCount} tone="amber" icon={<AlertTriangle />} />
          </div>
        </div>
      </section>

      <OutcomeAnalysisPanel analysis={analysis} />

      {canManagePrograms && (
        <StudentFollowupPanel
          classroomId={classroomId}
          memberRef={analysis.student.memberRef}
          onChanged={onFollowupChanged}
        />
      )}

      {canManagePrograms && (
        <section className="institution-program-print-root rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-black"><CalendarDays className="h-5 w-5 text-[var(--primary)]" /> Haftalık çalışma programı</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Taslak analizden üretilir; siz inceleyip yayınlamadan öğrenciye açılmaz.</p>
            </div>
            {!program && <button type="button" disabled={programBusy} onClick={createProgram} className="institution-program-screen-only btn-primary min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-60">{programBusy ? 'Hazırlanıyor…' : 'Taslak oluştur'}</button>}
          </div>
          {programError && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{programError}</p>}
          {program && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-col gap-2 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs text-[var(--text-sub)]">Öğrenci</p><strong className="block text-base">{analysis.student.alias}</strong></div>
                <button type="button" onClick={printProgram} className="institution-program-screen-only inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold"><Printer className="h-4 w-4" /> Yazdır / PDF</button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs">
                <span><strong>{program.draft.weekStart}</strong> haftası · {program.draft.items.length} görev · günlük en fazla {program.program.dailyMinuteLimit} dk</span>
                <span className={`rounded-lg px-2 py-1 font-black ${program.program.status === 'published' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}>{program.program.status === 'published' ? 'Yayınlandı' : programDirty ? 'Kaydedilmemiş değişiklik' : 'Taslak'}</span>
              </div>
              <ol className="space-y-2">
                {program.draft.items.map((item) => <li key={item.position} className="grid gap-2 rounded-xl border border-white/10 p-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center"><span className="text-xs text-[var(--text-sub)]">{item.scheduledDate}</span><span className="min-w-0 break-words font-bold">{item.title}<small className="mt-1 block font-normal text-[var(--text-sub)]">{item.reasonCode} · {item.targetQuestionCount ?? 0} soru</small></span><span className="flex items-center gap-2 sm:justify-end"><span className="text-xs font-bold text-[var(--primary)]">{item.durationMinutes} dk</span>{program.program.status === 'draft' && <button type="button" disabled={programBusy || program.draft.items.length <= 1} onClick={() => removeProgramItem(item.position)} aria-label={`${item.title} görevini çıkar`} className="institution-program-screen-only inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-400/20 text-red-200 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>}</span></li>)}
              </ol>
              {program.program.status === 'draft' && <div className="institution-program-screen-only flex flex-col gap-2 sm:flex-row"><button type="button" disabled={programBusy || !programDirty} onClick={saveProgram} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold disabled:opacity-40"><Save className="h-4 w-4" /> Değişiklikleri kaydet</button><button type="button" disabled={programBusy || programDirty} onClick={publishProgram} className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-60"><Send className="h-4 w-4" /> {programDirty ? 'Önce değişiklikleri kaydet' : programBusy ? 'Yayınlanıyor…' : 'İnceledim, yayınla'}</button></div>}
            </div>
          )}
        </section>
      )}

      {canManagePrograms && (
        <ProgramReviewPanel classroomId={classroomId} memberRef={analysis.student.memberRef} />
      )}

      {canManagePrograms && (
        <StudentReportPanel classroomId={classroomId} memberRef={analysis.student.memberRef} />
      )}

      {canManagePrograms && guardianEmailDraft && (
        <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-lg font-black"><Mail className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" /> Veli bilgilendirme taslağı</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Adres saklanmaz ve sistem gönderim yapmaz. Kanıt, takip ve programı inceledikten sonra metni kendi e-posta aracınızda kullanın.</p>
            </div>
            <button type="button" onClick={copyGuardianEmailDraft} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /> {emailDraftStatus === 'copied' ? 'Kopyalandı' : emailDraftStatus === 'error' ? 'Kopyalanamadı' : 'E-posta taslağını kopyala'}</button>
          </div>
        </section>
      )}
    </div>
  )
}

function OutcomeAnalysisPanel({ analysis }: { analysis: InstitutionStudentLearningAnalysis }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">Kazanım analizi</h3>
            <p className="mt-1 text-xs text-[var(--text-sub)]">Her skorun paydası, güveni ve son kanıt tarihi görünür.</p>
          </div>
          <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-xs font-bold">{analysis.coverage.percentage}% kapsam</span>
        </div>

        <div className="mt-4 space-y-3">
          {analysis.outcomes.map((outcome) => {
            const status = statusCopy[outcome.assessment.status]
            return (
              <article key={outcome.code} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-[var(--text-sub)]">{outcome.path.slice(1, 3).join(' › ')}</p>
                    <h4 className="mt-1 break-words text-sm font-black sm:text-base">{outcome.title}</h4>
                  </div>
                  <span className={`w-fit shrink-0 rounded-lg border px-2.5 py-1 text-xs font-black ${status.className}`}>{status.label}</span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-[var(--text-sub)]">Açıklanabilir skor</span>
                      <strong>{outcome.assessment.score === null ? '—' : `%${outcome.assessment.score}`}</strong>
                    </div>
                    <div className="mt-2">
                      <PercentBar
                        value={outcome.assessment.score}
                        tone={outcome.assessment.status === 'mastered' ? 'emerald' : outcome.assessment.status === 'developing' ? 'sky' : 'amber'}
                        label={`${outcome.title} açıklanabilir skoru`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs sm:text-right">
                    <span className="text-[var(--text-sub)]">Kanıt</span>
                    <strong>{outcome.assessment.evidence.evidenceCount}</strong>
                    <span className="text-[var(--text-sub)]">Bağımsız oturum</span>
                    <strong>{outcome.assessment.evidence.independentEvidenceCount}</strong>
                    <span className="text-[var(--text-sub)]">Güven</span>
                    <strong>{confidenceCopy[outcome.assessment.confidence]}</strong>
                    <span className="text-[var(--text-sub)]">Son kanıt</span>
                    <strong>{formatDate(outcome.assessment.evidence.lastEvidenceAt)}</strong>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>
  )
}

function SummaryCard({
  label,
  value,
  total,
  tone = 'primary',
  icon,
}: {
  label: string
  value: number
  total: number
  tone?: 'primary' | 'emerald' | 'sky' | 'amber'
  icon: React.ReactElement
}) {
  const tones = {
    primary: 'text-[var(--primary)]',
    emerald: 'text-emerald-300',
    sky: 'text-sky-300',
    amber: 'text-amber-300',
  }
  const bars = {
    primary: 'bg-[var(--primary)]',
    emerald: 'bg-emerald-400',
    sky: 'bg-sky-400',
    amber: 'bg-amber-400',
  }
  const ratio = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className={`[&>svg]:h-4 [&>svg]:w-4 ${tones[tone]}`} aria-hidden="true">{icon}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <strong className="block text-xl font-black leading-none">{value}</strong>
        <span className="text-[10px] font-bold text-[var(--text-sub)]">%{ratio}</span>
      </div>
      <span className="mt-0.5 block truncate text-[11px] text-[var(--text-sub)] sm:text-xs">{label}</span>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className={`h-full rounded-full ${bars[tone]}`} style={{ width: `${ratio}%` }} />
      </div>
    </div>
  )
}

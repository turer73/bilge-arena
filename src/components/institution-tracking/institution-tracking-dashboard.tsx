'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  RefreshCw,
  Send,
  Save,
  Trash2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import {
  fetchInstitutionStudentLearningAnalysis,
  fetchInstitutionClassroomOverview,
  fetchInstitutionTrackingDirectory,
  createInstitutionStudyProgramDraft,
  publishInstitutionStudyProgram,
  updateInstitutionStudyProgramDraft,
  InstitutionTrackingClientError,
  isInstitutionTrackingUiEnabled,
} from '@/lib/institution-tracking/client'
import type { InstitutionTrackingDirectory } from '@/lib/institution-tracking/directory'
import type { InstitutionStudentLearningAnalysis } from '@/lib/institution-tracking/student-analysis'
import type { InstitutionStudyProgramDraftResponse } from '@/lib/institution-tracking/study-program'
import type { InstitutionClassroomOverview } from '@/lib/institution-tracking/classroom-overview'
import { ClassroomOverviewPanel } from './classroom-overview-panel'

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
    timeZone: 'Europe/Istanbul',
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

export function InstitutionTrackingDashboard() {
  const enabled = isInstitutionTrackingUiEnabled()
  const [directory, setDirectory] = useState<InstitutionTrackingDirectory | null>(null)
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null)
  const [selectedMemberRef, setSelectedMemberRef] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<InstitutionStudentLearningAnalysis | null>(null)
  const [classroomOverview, setClassroomOverview] = useState<InstitutionClassroomOverview | null>(null)
  const [classroomOverviewLoading, setClassroomOverviewLoading] = useState(false)
  const [classroomOverviewError, setClassroomOverviewError] = useState(false)
  const [directoryLoading, setDirectoryLoading] = useState(enabled)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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
        setSelectedClassroomId((current) => (
          current && next.classrooms.some((classroom) => classroom.id === current)
            ? current
            : next.classrooms[0]?.id ?? null
        ))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setDirectory(null)
        setErrorStatus(error instanceof InstitutionTrackingClientError ? error.status : 500)
      } finally {
        if (!controller.signal.aborted) setDirectoryLoading(false)
      }
    })
    return () => controller.abort()
  }, [enabled, refreshKey])

  const selectedClassroom = useMemo(() => directory?.classrooms.find(
    (classroom) => classroom.id === selectedClassroomId,
  ) ?? null, [directory, selectedClassroomId])

  useEffect(() => {
    if (!selectedClassroom) {
      setSelectedMemberRef(null)
      return
    }
    setSelectedMemberRef((current) => (
      current && selectedClassroom.students.some((student) => student.memberRef === current)
        ? current
        : selectedClassroom.students[0]?.memberRef ?? null
    ))
  }, [selectedClassroom])

  useEffect(() => {
    if (!selectedClassroomId) {
      setClassroomOverview(null)
      setClassroomOverviewError(false)
      return
    }
    const controller = new AbortController()
    queueMicrotask(async () => {
      setClassroomOverviewLoading(true)
      setClassroomOverviewError(false)
      try {
        const next = await fetchInstitutionClassroomOverview(selectedClassroomId, controller.signal)
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
  }, [selectedClassroomId, refreshKey])

  useEffect(() => {
    if (!selectedClassroomId || !selectedMemberRef) {
      setAnalysis(null)
      return
    }
    const controller = new AbortController()
    queueMicrotask(async () => {
      setAnalysisLoading(true)
      try {
        const next = await fetchInstitutionStudentLearningAnalysis(
          selectedClassroomId,
          selectedMemberRef,
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
  }, [selectedClassroomId, selectedMemberRef, refreshKey])

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

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" /> Kurum çalışma alanı
            </div>
            <h1 className="mt-2 truncate text-2xl font-black sm:text-3xl">{directory.institution.name}</h1>
            <p className="mt-1 text-sm text-[var(--text-sub)]">
              {directory.membership.role === 'manager' ? 'Kurum yöneticisi görünümü' : 'Öğretmen görünümü'} · Açıklanabilir öğrenci takibi
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Doğrulanmış kanıt
          </div>
        </div>
      </header>

      {directory.classrooms.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-[var(--surface)] p-8 text-center">
          <Users className="mx-auto h-9 w-9 text-[var(--text-sub)]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-black">Aktif sınıf bulunamadı</h2>
          <p className="mt-2 text-sm text-[var(--text-sub)]">Önce kuruma bağlı aktif bir sınıf ve öğrenci üyeliği gerekir.</p>
        </section>
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-3">
              <h2 className="px-2 pb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-sub)]">Sınıflar</h2>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Kurum sınıfları">
                {directory.classrooms.map((classroom) => {
                  const selected = classroom.id === selectedClassroomId
                  return (
                    <button
                      key={classroom.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedClassroomId(classroom.id)}
                      className={`min-w-[14rem] rounded-xl border p-3 text-left transition lg:min-w-0 ${selected
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}
                    >
                      <span className="block truncate text-sm font-black">{classroom.name}</span>
                      <span className="mt-1 block truncate text-xs text-[var(--text-sub)]">{classroom.teacherAlias}</span>
                      <span className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--primary)]">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" /> {classroom.activeStudentCount} öğrenci
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {selectedClassroom && (
              <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-3">
                <h2 className="px-2 pb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-sub)]">Öğrenciler</h2>
                {selectedClassroom.students.length === 0 ? (
                  <p className="rounded-xl bg-white/[0.03] p-3 text-sm text-[var(--text-sub)]">Bu sınıfta görünür aktif öğrenci yok.</p>
                ) : (
                  <div className="flex max-h-80 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible" aria-label="Sınıf öğrencileri">
                    {selectedClassroom.students.map((student) => {
                      const selected = student.memberRef === selectedMemberRef
                      return (
                        <button
                          key={student.memberRef}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedMemberRef(student.memberRef)}
                          className={`flex min-w-[13rem] items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left lg:min-w-0 ${selected
                            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                            : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{student.alias}</span>
                            <span className="mt-0.5 block text-xs text-[var(--text-sub)]">Katılım {formatDate(student.joinedAt)}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </aside>

          <main className="min-w-0 space-y-4" aria-live="polite">
            {classroomOverviewLoading && !classroomOverview ? (
              <div className="h-64 animate-pulse rounded-2xl bg-white/5" aria-label="Sınıf özeti yükleniyor" />
            ) : classroomOverview ? (
              <ClassroomOverviewPanel overview={classroomOverview} />
            ) : classroomOverviewError ? (
              <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                Sınıf özeti eksiksiz doğrulanamadığı için gösterilmiyor. Öğrenci analizi ayrı olarak kullanılabilir.
              </section>
            ) : null}
            {!selectedMemberRef ? (
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
                canManagePrograms={directory.membership.role === 'teacher'}
              />
            )}
          </main>
        </div>
      )}
    </div>
  )
}

function AnalysisPanel({
  analysis,
  classroomId,
  canManagePrograms,
}: {
  analysis: InstitutionStudentLearningAnalysis
  classroomId: string
  canManagePrograms: boolean
}) {
  const [program, setProgram] = useState<InstitutionStudyProgramDraftResponse | null>(null)
  const [programBusy, setProgramBusy] = useState(false)
  const [programError, setProgramError] = useState<string | null>(null)
  const [programDirty, setProgramDirty] = useState(false)

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

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">Öğrenci durum tespiti</p>
            <h2 className="mt-1 truncate text-xl font-black sm:text-2xl">{analysis.student.alias}</h2>
            <p className="mt-1 text-sm text-[var(--text-sub)]">TYT Matematik · {analysis.scope.taxonomyVersion}</p>
          </div>
          <div className="text-xs text-[var(--text-sub)] sm:text-right">
            <span className="block">Kanıt başlangıcı</span>
            <strong className="mt-1 block text-[var(--text)]">{formatDate(analysis.scope.windowStart)}</strong>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCard label="Ölçülen" value={analysis.summary.assessedOutcomeCount} icon={<BarChart3 />} />
          <SummaryCard label="Güçlü" value={analysis.summary.masteredOutcomeCount} tone="emerald" icon={<BookOpenCheck />} />
          <SummaryCard label="Gelişiyor" value={analysis.summary.developingOutcomeCount} tone="sky" icon={<BarChart3 />} />
          <SummaryCard label="Kanıt yetersiz" value={analysis.summary.insufficientOutcomeCount} tone="amber" icon={<AlertTriangle />} />
        </div>
      </section>

      {canManagePrograms && (
        <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-black"><CalendarDays className="h-5 w-5 text-[var(--primary)]" /> Haftalık çalışma programı</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Taslak analizden üretilir; siz inceleyip yayınlamadan öğrenciye açılmaz.</p>
            </div>
            {!program && <button type="button" disabled={programBusy} onClick={createProgram} className="btn-primary min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-60">{programBusy ? 'Hazırlanıyor…' : 'Taslak oluştur'}</button>}
          </div>
          {programError && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{programError}</p>}
          {program && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs">
                <span><strong>{program.draft.weekStart}</strong> haftası · {program.draft.items.length} görev · günlük en fazla {program.program.dailyMinuteLimit} dk</span>
                <span className={`rounded-lg px-2 py-1 font-black ${program.program.status === 'published' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}>{program.program.status === 'published' ? 'Yayınlandı' : programDirty ? 'Kaydedilmemiş değişiklik' : 'Taslak'}</span>
              </div>
              <ol className="space-y-2">
                {program.draft.items.map((item) => <li key={item.position} className="grid gap-2 rounded-xl border border-white/10 p-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center"><span className="text-xs text-[var(--text-sub)]">{item.scheduledDate}</span><span className="min-w-0 break-words font-bold">{item.title}<small className="mt-1 block font-normal text-[var(--text-sub)]">{item.reasonCode} · {item.targetQuestionCount ?? 0} soru</small></span><span className="flex items-center gap-2 sm:justify-end"><span className="text-xs font-bold text-[var(--primary)]">{item.durationMinutes} dk</span>{program.program.status === 'draft' && <button type="button" disabled={programBusy || program.draft.items.length <= 1} onClick={() => removeProgramItem(item.position)} aria-label={`${item.title} görevini çıkar`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-400/20 text-red-200 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>}</span></li>)}
              </ol>
              {program.program.status === 'draft' && <div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={programBusy || !programDirty} onClick={saveProgram} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold disabled:opacity-40"><Save className="h-4 w-4" /> Değişiklikleri kaydet</button><button type="button" disabled={programBusy || programDirty} onClick={publishProgram} className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-60"><Send className="h-4 w-4" /> {programDirty ? 'Önce değişiklikleri kaydet' : programBusy ? 'Yayınlanıyor…' : 'İnceledim, yayınla'}</button></div>}
            </div>
          )}
        </section>
      )}

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
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{ width: `${outcome.assessment.score ?? 0}%` }}
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
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone = 'primary',
  icon,
}: {
  label: string
  value: number
  tone?: 'primary' | 'emerald' | 'sky' | 'amber'
  icon: React.ReactElement
}) {
  const tones = {
    primary: 'text-[var(--primary)]',
    emerald: 'text-emerald-300',
    sky: 'text-sky-300',
    amber: 'text-amber-300',
  }
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div className={`[&>svg]:h-4 [&>svg]:w-4 ${tones[tone]}`} aria-hidden="true">{icon}</div>
      <strong className="mt-2 block text-xl font-black">{value}</strong>
      <span className="mt-0.5 block truncate text-[11px] text-[var(--text-sub)] sm:text-xs">{label}</span>
    </div>
  )
}

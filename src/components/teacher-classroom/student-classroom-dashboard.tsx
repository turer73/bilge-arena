'use client'

import { useCallback, useEffect, useState } from 'react'
import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'
import {
  BookOpenCheck,
  DoorOpen,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  fetchStudentTeacherAssignments,
  fetchStudentTeacherMemberships,
  withdrawTeacherClassroom,
} from '@/lib/teacher-classroom/client'
import type {
  StudentTeacherAssignments,
  StudentTeacherMemberships,
} from '@/lib/teacher-classroom/server-contract'
import {
  assignmentStatusLabels,
  formatIstanbulDateTime,
} from '@/lib/teacher-classroom/view-utils'

export function StudentClassroomDashboard() {
  const { user, loading: authLoading } = useAuthStore()
  const [memberships, setMemberships] = useState<StudentTeacherMemberships | null>(null)
  const [assignments, setAssignments] = useState<StudentTeacherAssignments | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [confirmingClass, setConfirmingClass] = useState<string | null>(null)
  const [withdrawingClass, setWithdrawingClass] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve()
    if (signal?.aborted) return
    setLoading(true)
    setFailed(false)
    try {
      const [membershipResult, assignmentResult] = await Promise.all([
        fetchStudentTeacherMemberships(signal),
        fetchStudentTeacherAssignments(signal),
      ])
      setMemberships(membershipResult)
      setAssignments(assignmentResult)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setFailed(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal)
    })
    return () => controller.abort()
  }, [load, user])

  const withdraw = async (classroomId: string) => {
    if (withdrawingClass) return
    setWithdrawingClass(classroomId)
    setAnnouncement('')
    try {
      await withdrawTeacherClassroom(classroomId, { requestId: crypto.randomUUID() })
      setMemberships((current) => current
        ? { classrooms: current.classrooms.filter((item) => item.id !== classroomId) }
        : current)
      setAssignments((current) => current
        ? { assignments: current.assignments.filter((item) => item.classroom.id !== classroomId) }
        : current)
      setConfirmingClass(null)
      setAnnouncement('Paylaşım durduruldu ve sınıftan ayrıldın.')
    } catch {
      setAnnouncement('Paylaşım durdurulamadı. Lütfen yeniden dene.')
    } finally {
      setWithdrawingClass(null)
    }
  }

  if (authLoading) {
    return (
      <div role="status" className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">
        Sınıfların yükleniyor...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <GraduationCap className="mx-auto h-11 w-11 text-[var(--focus)]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">Sınıfların için giriş yap</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
          Davetlerin ve ödevlerin yalnız doğrulanmış hesabına gösterilir.
        </p>
        <Link href="/giris" className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-xl px-7 text-sm font-bold">
          Giriş yap
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div role="status" className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">
        Sınıfların ve ödevlerin yükleniyor...
      </div>
    )
  }

  if (failed || !memberships || !assignments) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">Sınıflar açılamadı</h1>
        <p role="alert" className="mt-2 text-sm text-[var(--text-sub)]">
          Geçici bir bağlantı sorunu oluştu veya pilot hesabında açık değil.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 md:py-10">
      <header className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm">
        <div className="bg-[var(--bg-secondary)] px-5 py-5 md:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
                ÖĞRETMEN SINIFLARI · ÖZEL
              </p>
              <h1 className="mt-1 text-2xl font-black md:text-3xl">Sınıflarım ve ödevlerim</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-sub)]">
                Yalnız katıldığın sınıfları ve sana atanmış ödevleri görürsün. Sınıf arkadaşların sana gösterilmez.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/arena/sinif/davet"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold hover:bg-[var(--cardHover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" /> Davete katıl
              </Link>
              <Link
                href="/arena/sinif/ogretmen"
                className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                Öğretmen paneli
              </Link>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 px-5 py-4 text-sm leading-6 md:px-7">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--growth)]" aria-hidden="true" />
          <p>
            Öğretmenin yalnız gönderim durumunu ve doğru/yanıtlanan sayılarını görür; hangi soruda ne işaretlediğini göremez.
            Bu ödevler XP, coin, seri, görev, rozet veya sıralama puanı vermez.
          </p>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      <section aria-labelledby="student-classes-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="student-classes-title" className="text-lg font-black">Aktif sınıflarım</h2>
          <span className="text-sm text-[var(--text-sub)]">{memberships.classrooms.length} sınıf</span>
        </div>
        {memberships.classrooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-bg)] p-6 text-center text-sm leading-6 text-[var(--text-sub)]">
            Henüz aktif bir sınıfa katılmadın. Öğretmeninin verdiği davet bağlantısını açabilirsin.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {memberships.classrooms.map((classroom) => (
              <article key={classroom.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
                <h3 className="font-black">{classroom.name}</h3>
                <p className="mt-1 text-sm text-[var(--text-sub)]">{classroom.teacherAlias}</p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Katılım: {formatIstanbulDateTime(classroom.joinedAt)}
                </p>
                {confirmingClass === classroom.id ? (
                  <div role="group" aria-label={`${classroom.name} sınıfından ayrılmayı onayla`} className="mt-4 rounded-xl border border-[var(--urgency)]/30 bg-[var(--urgency)]/5 p-3">
                    <p className="text-sm leading-5">Paylaşım hemen durur; bu sınıfın mevcut ve gelecekteki ödevlerine erişimin kesilir.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void withdraw(classroom.id)}
                        disabled={withdrawingClass === classroom.id}
                        className="inline-flex min-h-11 items-center rounded-xl bg-[var(--urgency)] px-4 text-sm font-black text-white disabled:opacity-60"
                      >
                        {withdrawingClass === classroom.id ? 'Durduruluyor...' : 'Evet, paylaşımı durdur'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingClass(null)}
                        className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingClass(classroom.id)}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--urgency)] hover:bg-[var(--urgency)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                  >
                    <DoorOpen className="h-4 w-4" aria-hidden="true" /> Paylaşımı durdur / sınıftan ayrıl
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="student-assignments-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="student-assignments-title" className="text-lg font-black">Ödevlerim</h2>
          <span className="text-sm text-[var(--text-sub)]">{assignments.assignments.length} ödev</span>
        </div>
        {assignments.assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-bg)] p-6 text-center text-sm text-[var(--text-sub)]">
            Şu anda sana atanmış bir ödev yok.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {assignments.assignments.map((item) => {
              const canOpen = item.status !== 'upcoming'
              return (
                <article key={item.id} className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-[var(--focus)]">{item.classroom.name}</p>
                      <h3 className="mt-1 font-black">{item.title}</h3>
                    </div>
                    <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[10px] font-extrabold">
                      {assignmentStatusLabels[item.status]}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm text-[var(--text-sub)]">
                    <div><dt className="inline font-bold text-[var(--text)]">Soru:</dt> <dd className="inline">{item.questionCount}</dd></div>
                    <div><dt className="inline font-bold text-[var(--text)]">Son teslim:</dt> <dd className="inline">{formatIstanbulDateTime(item.dueAt)}</dd></div>
                    <div><dt className="inline font-bold text-[var(--text)]">Öğretmen:</dt> <dd className="inline">{item.classroom.teacherAlias}</dd></div>
                  </dl>
                  {canOpen ? (
                    <Link
                      href={`/arena/sinif/odev/${item.id}`}
                      className="btn-primary mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black"
                    >
                      <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                      {item.status === 'submitted' ? 'Sonucu gör' : 'Ödevi aç'}
                    </Link>
                  ) : (
                    <p className="mt-5 rounded-xl bg-[var(--surface)] px-4 py-3 text-center text-sm font-bold text-[var(--text-sub)]">
                      {formatIstanbulDateTime(item.availableAt)} tarihinde açılacak
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

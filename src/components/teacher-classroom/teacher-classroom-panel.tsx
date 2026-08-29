'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'
import {
  BookPlus,
  Check,
  Clipboard,
  GraduationCap,
  Presentation,
  ShieldAlert,
  Link2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  createTeacherClassroom,
  fetchClassroomBilgeTahtaAccess,
  fetchClassroomExamMode,
  fetchTeacherClassroomOverview,
  fetchTeacherClassrooms,
  issueTeacherClassroomInvite,
  publishTeacherAssignment,
  removeTeacherClassroomMember,
  revokeTeacherClassroomInvite,
  TeacherClassroomClientError,
  updateClassroomBilgeTahtaAccess,
  updateClassroomExamMode,
} from '@/lib/teacher-classroom/client'
import type {
  TeacherClassroomList,
  TeacherClassroomOverview,
  TeacherInviteIssueResponse,
} from '@/lib/teacher-classroom/server-contract'
import {
  formatIstanbulDateTime,
  istanbulDateTimeInputToIso,
  toIstanbulDateTimeInput,
} from '@/lib/teacher-classroom/view-utils'

const GAME_OPTIONS = [
  ['matematik', 'Matematik'],
  ['turkce', 'Türkçe'],
  ['fen', 'Fen'],
  ['sosyal', 'Sosyal'],
  ['wordquest', 'İngilizce'],
] as const
const EXAM_OPTIONS = ['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT'] as const

type StableRequest = { fingerprint: string; requestId: string }

export function TeacherClassroomPanel() {
  const { user, loading: authLoading } = useAuthStore()
  const [classes, setClasses] = useState<TeacherClassroomList | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [overview, setOverview] = useState<TeacherClassroomOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [bilgeTahtaEnabled, setBilgeTahtaEnabled] = useState(false)
  const [bilgeTahtaSaving, setBilgeTahtaSaving] = useState(false)
  const bilgeTahtaRef = useRef<StableRequest | null>(null)
  const [examModeEnabled, setExamModeEnabled] = useState(false)
  const [examModeUntil, setExamModeUntil] = useState<string | null>(null)
  const [examModeSaving, setExamModeSaving] = useState(false)
  const examModeRef = useRef<StableRequest | null>(null)

  const [className, setClassName] = useState('')
  const [creating, setCreating] = useState(false)
  const createRef = useRef<StableRequest | null>(null)

  const [inviteHours, setInviteHours] = useState(24)
  const [inviteMaxUses, setInviteMaxUses] = useState(10)
  const [issuingInvite, setIssuingInvite] = useState(false)
  const [invite, setInvite] = useState<TeacherInviteIssueResponse | null>(null)
  const inviteRef = useRef<(StableRequest & { expiresAt: string }) | null>(null)
  const revokeRef = useRef<StableRequest | null>(null)

  const [title, setTitle] = useState('')
  const [game, setGame] = useState<(typeof GAME_OPTIONS)[number][0]>('matematik')
  const [examRef, setExamRef] = useState<(typeof EXAM_OPTIONS)[number]>('TYT')
  const [category, setCategory] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [questionCount, setQuestionCount] = useState(10)
  const [availableInput, setAvailableInput] = useState(() => (
    toIstanbulDateTimeInput(new Date(Date.now() - 60_000))
  ))
  const [dueInput, setDueInput] = useState(() => (
    toIstanbulDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000))
  ))
  const [publishing, setPublishing] = useState(false)
  const publishRef = useRef<StableRequest | null>(null)
  const removeRefs = useRef(new Map<string, string>())
  const [confirmingMember, setConfirmingMember] = useState<string | null>(null)
  const [removingMember, setRemovingMember] = useState<string | null>(null)

  const loadClasses = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve()
    if (signal?.aborted) return
    setLoading(true)
    setErrorStatus(null)
    try {
      const result = await fetchTeacherClassrooms(signal)
      setClasses(result)
      setSelectedId((current) => (
        current && result.classrooms.some((item) => item.id === current)
          ? current
          : result.classrooms[0]?.id ?? null
      ))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setErrorStatus(error instanceof TeacherClassroomClientError ? error.status : 500)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  const loadOverview = useCallback(async (classroomId: string, signal?: AbortSignal) => {
    await Promise.resolve()
    if (signal?.aborted) return
    setOverviewLoading(true)
    try {
      const [nextOverview, access, exam] = await Promise.all([
        fetchTeacherClassroomOverview(classroomId, signal),
        fetchClassroomBilgeTahtaAccess(classroomId, signal),
        fetchClassroomExamMode(classroomId, signal),
      ])
      setOverview(nextOverview)
      setBilgeTahtaEnabled(access.enabled)
      setExamModeEnabled(exam.examMode)
      setExamModeUntil(exam.until)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setOverview(null)
      setAnnouncement('Sınıf özeti alınamadı.')
    } finally {
      if (!signal?.aborted) setOverviewLoading(false)
    }
  }, [])

  const toggleBilgeTahta = async () => {
    if (!selectedId || bilgeTahtaSaving) return
    const nextEnabled = !bilgeTahtaEnabled
    const fingerprint = `${selectedId}:${nextEnabled}`
    const pending = bilgeTahtaRef.current?.fingerprint === fingerprint
      ? bilgeTahtaRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    bilgeTahtaRef.current = pending
    setBilgeTahtaSaving(true)
    setAnnouncement('')
    try {
      const result = await updateClassroomBilgeTahtaAccess(selectedId, {
        enabled: nextEnabled,
        requestId: pending.requestId,
      })
      bilgeTahtaRef.current = null
      setBilgeTahtaEnabled(result.enabled)
      setAnnouncement(result.enabled
        ? 'Bilge Tahta bu sınıfın teslim edilmiş ödevlerinde açıldı.'
        : 'Bilge Tahta bu sınıf için kapatıldı.')
    } catch {
      setAnnouncement('Bilge Tahta ayarı kaydedilemedi. Aynı seçimle güvenle yeniden deneyebilirsin.')
    } finally {
      setBilgeTahtaSaving(false)
    }
  }

  const toggleExamMode = async () => {
    if (!selectedId || examModeSaving) return
    const nextEnabled = !examModeEnabled
    const fingerprint = `${selectedId}:${nextEnabled}`
    // Ayni secim tekrar gonderilirse RPC replay olarak doner; yeni pencere acilmaz.
    const pending = examModeRef.current?.fingerprint === fingerprint
      ? examModeRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    examModeRef.current = pending
    setExamModeSaving(true)
    setAnnouncement('')
    try {
      const result = await updateClassroomExamMode(selectedId, {
        enabled: nextEnabled,
        requestId: pending.requestId,
      })
      examModeRef.current = null
      setExamModeEnabled(result.examMode)
      setExamModeUntil(result.until)
      setAnnouncement(result.examMode
        ? 'Sınav modu açıldı. Bu sınıftaki öğrencilerde bütün yardımcılar kapandı.'
        : 'Sınav modu kapatıldı. Yardımcılar yeniden kullanılabilir.')
    } catch {
      setAnnouncement('Sınav modu kaydedilemedi. Aynı seçimle güvenle yeniden deneyebilirsin.')
    } finally {
      setExamModeSaving(false)
    }
  }

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadClasses(controller.signal)
    })
    return () => controller.abort()
  }, [loadClasses, user])

  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadOverview(selectedId, controller.signal)
    })
    return () => controller.abort()
  }, [loadOverview, selectedId])

  const createClass = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = className.trim()
    if (normalized.length < 2 || creating) return
    const pending = createRef.current?.fingerprint === normalized
      ? createRef.current
      : { fingerprint: normalized, requestId: crypto.randomUUID() }
    createRef.current = pending
    setCreating(true)
    setAnnouncement('')
    try {
      const result = await createTeacherClassroom({ name: normalized, requestId: pending.requestId })
      createRef.current = null
      setClassName('')
      await loadClasses()
      setInvite(null)
      inviteRef.current = null
      revokeRef.current = null
      setSelectedId(result.classroom.id)
      setAnnouncement(`${result.classroom.name} sınıfı oluşturuldu.`)
    } catch {
      setAnnouncement('Sınıf oluşturulamadı. Aynı adla güvenle yeniden deneyebilirsin.')
    } finally {
      setCreating(false)
    }
  }

  const issueInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedId || issuingInvite) return
    const fingerprint = `${selectedId}:${inviteHours}:${inviteMaxUses}`
    const pending = inviteRef.current?.fingerprint === fingerprint
      ? inviteRef.current
      : {
          fingerprint,
          requestId: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + inviteHours * 60 * 60 * 1000).toISOString(),
        }
    inviteRef.current = pending
    setIssuingInvite(true)
    setAnnouncement('')
    try {
      setInvite(await issueTeacherClassroomInvite(selectedId, {
        expiresAt: pending.expiresAt,
        maxUses: inviteMaxUses,
        requestId: pending.requestId,
      }))
      setAnnouncement('Özel davet bağlantısı hazır. Bu ekrandan ayrılmadan kopyala.')
    } catch {
      setAnnouncement('Davet oluşturulamadı. Aynı ayarlarla güvenle yeniden deneyebilirsin.')
    } finally {
      setIssuingInvite(false)
    }
  }

  const revokeInvite = async () => {
    if (!invite || issuingInvite) return
    const fingerprint = invite.inviteRef
    const pending = revokeRef.current?.fingerprint === fingerprint
      ? revokeRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    revokeRef.current = pending
    setIssuingInvite(true)
    try {
      await revokeTeacherClassroomInvite(invite.inviteRef, { requestId: pending.requestId })
      setInvite(null)
      inviteRef.current = null
      revokeRef.current = null
      setAnnouncement('Davet iptal edildi.')
    } catch {
      setAnnouncement('Davet iptal edilemedi. Aynı istekle yeniden deneyebilirsin.')
    } finally {
      setIssuingInvite(false)
    }
  }

  const publish = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedId || publishing) return
    const availableAt = istanbulDateTimeInputToIso(availableInput)
    const dueAt = istanbulDateTimeInputToIso(dueInput)
    if (!availableAt || !dueAt) {
      setAnnouncement('Ödev başlangıç ve son teslim zamanlarını kontrol et.')
      return
    }
    const base = {
      title: title.trim(),
      game,
      examRef: game === 'wordquest' ? null : examRef,
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      ...(difficulty ? { difficulty: Number(difficulty) } : {}),
      questionCount,
      availableAt,
      dueAt,
    }
    const fingerprint = JSON.stringify(base)
    const pending = publishRef.current?.fingerprint === fingerprint
      ? publishRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    publishRef.current = pending
    setPublishing(true)
    setAnnouncement('')
    try {
      await publishTeacherAssignment(selectedId, { ...base, requestId: pending.requestId })
      publishRef.current = null
      setTitle('')
      await loadOverview(selectedId)
      await loadClasses()
      setAnnouncement('Ödev, o andaki aktif öğrenci listesine yayımlandı.')
    } catch (error) {
      const notEnough = error instanceof TeacherClassroomClientError && error.status === 422
      setAnnouncement(notEnough
        ? 'Bu filtrelerde yeterli aktif soru yok. Filtreyi genişlet.'
        : 'Ödev yayımlanamadı. Aynı içerikle güvenle yeniden deneyebilirsin.')
    } finally {
      setPublishing(false)
    }
  }

  const removeMember = async (memberRef: string) => {
    if (!selectedId || removingMember) return
    const requestId = removeRefs.current.get(memberRef) ?? crypto.randomUUID()
    removeRefs.current.set(memberRef, requestId)
    setRemovingMember(memberRef)
    try {
      await removeTeacherClassroomMember(selectedId, memberRef, { requestId })
      removeRefs.current.delete(memberRef)
      setConfirmingMember(null)
      await loadOverview(selectedId)
      await loadClasses()
      setAnnouncement('Öğrencinin sınıf erişimi ve yeni ilerleme paylaşımı kesildi.')
    } catch {
      setAnnouncement('Öğrenci çıkarılamadı. Aynı istekle yeniden deneyebilirsin.')
    } finally {
      setRemovingMember(null)
    }
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const shareUrl = useMemo(() => invite ? `${origin}${invite.sharePath}` : '', [invite, origin])

  if (authLoading || (user && loading)) {
    return <div role="status" className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">Öğretmen paneli yükleniyor...</div>
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <GraduationCap className="mx-auto h-11 w-11 text-[var(--focus)]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">Öğretmen paneli için giriş yap</h1>
        <Link href="/giris" className="btn-primary mt-5 inline-flex min-h-11 items-center rounded-xl px-6 text-sm font-bold">Giriş yap</Link>
      </div>
    )
  }
  if (errorStatus || !classes) {
    const forbidden = errorStatus === 403
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">{forbidden ? 'Pilot öğretmen yetkisi gerekli' : 'Öğretmen paneli açılamadı'}</h1>
        <p role="alert" className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
          {forbidden
            ? 'Bu panel yalnız aktif kurum üyeliği ve sınıf yönetimi yetkisi bulunan öğretmenlere açıktır.'
            : 'Pilot yapılandırması kapalı veya geçici bir bağlantı sorunu var.'}
        </p>
        {!forbidden && (
          <button type="button" onClick={() => void loadClasses()} className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
          </button>
        )}
        <Link href="/arena/sinif" className="mt-5 inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-[var(--focus)]">Sınıflarıma dön</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-10">
      <header className="rounded-3xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-sm md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">2–3 ÖĞRETMENLİK KONTROLLÜ PİLOT</p>
            <h1 className="mt-1 text-2xl font-black md:text-3xl">Öğretmen sınıf paneli</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-sub)]">
              Sınıf daveti oluştur, soru bankası filtrelerinden ödev yayımla ve yalnız minimum ilerleme sayılarını izle.
            </p>
          </div>
          <Link href="/arena/sinif" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10">Öğrenci görünümüne dön</Link>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--growth)]/30 bg-[var(--growth)]/5 p-4 text-sm leading-6">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--growth)]" aria-hidden="true" />
          <p>Öğrenci UUID&apos;si, e-posta, ham cevap, yanlış soru, mastery/FSRS, oturum ve ödül verisi bu panele gelmez. Çekilen veya çıkarılan öğrencinin kimliği anında gizlenir.</p>
        </div>
      </header>

      <p className="min-h-5 text-sm text-[var(--text-sub)]" role="status" aria-live="polite">{announcement}</p>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section aria-labelledby="create-class-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
            <h2 id="create-class-title" className="font-black">Yeni sınıf</h2>
            <form onSubmit={createClass} className="mt-3 space-y-3">
              <label className="block text-sm font-bold" htmlFor="teacher-class-name">Sınıf adı</label>
              <input
                id="teacher-class-name"
                value={className}
                onChange={(event) => {
                  createRef.current = null
                  setClassName(event.target.value)
                }}
                minLength={2}
                maxLength={60}
                required
                className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                placeholder="12-A Matematik"
              />
              <button type="submit" disabled={creating} className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-60">
                <Users className="h-4 w-4" aria-hidden="true" /> {creating ? 'Oluşturuluyor...' : 'Sınıf oluştur'}
              </button>
            </form>
          </section>

          <nav aria-label="Öğretmen sınıfları" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
            <p className="px-2 pb-2 text-xs font-black text-[var(--text-sub)]">SINIFLARIM</p>
            {classes.classrooms.length === 0 ? (
              <p className="px-2 py-3 text-sm leading-6 text-[var(--text-sub)]">İlk sınıfını yukarıdan oluştur.</p>
            ) : classes.classrooms.map((classroom) => (
              <button
                type="button"
                key={classroom.id}
                onClick={() => {
                  setInvite(null)
                  inviteRef.current = null
                  revokeRef.current = null
                  setSelectedId(classroom.id)
                }}
                aria-current={selectedId === classroom.id ? 'page' : undefined}
                className="mb-1 flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm hover:bg-[var(--surface)] aria-[current=page]:bg-[var(--focus)]/10 aria-[current=page]:font-black aria-[current=page]:text-[var(--focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                <span className="truncate">{classroom.name}</span>
                <span className="shrink-0 text-xs">{classroom.activeStudentCount} öğrenci</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-6">
          {!selectedId ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-bg)] p-10 text-center text-sm text-[var(--text-sub)]">Çalışmak için bir sınıf oluştur.</div>
          ) : overviewLoading || !overview || overview.classroom.id !== selectedId ? (
            <div role="status" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-10 text-center text-sm text-[var(--text-sub)]">Sınıf özeti yükleniyor...</div>
          ) : (
            <>
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">{overview.classroom.name}</h2>
                    <p className="mt-1 text-sm text-[var(--text-sub)]">{overview.classroom.activeStudentCount} görünür aktif öğrenci · {overview.assignments.length} ödev</p>
                  </div>
                  <button type="button" onClick={() => void loadOverview(selectedId)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yenile
                  </button>
                </div>
                {overview.classroom.hiddenRecipientCount > 0 && (
                  <p className="mt-3 rounded-xl bg-[var(--surface)] p-3 text-sm text-[var(--text-sub)]">
                    {overview.classroom.hiddenRecipientCount} geçmiş/gizli üyelik kimliği mahremiyet nedeniyle gösterilmiyor.
                  </p>
                )}
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Presentation className="mt-0.5 h-5 w-5 shrink-0 text-[var(--wisdom-text)]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-black">Sınıf Bilge Tahta</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
                        Açıkken öğrenciler teslimden sonra her sorunun ayrıntılı konu anlatımını açabilir.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Sınıf Bilge Tahta"
                    aria-checked={bilgeTahtaEnabled}
                    disabled={bilgeTahtaSaving}
                    onClick={() => void toggleBilgeTahta()}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-black text-white disabled:opacity-60"
                    style={{ background: bilgeTahtaEnabled ? 'var(--growth)' : 'var(--text-muted)' }}
                  >
                    {bilgeTahtaSaving ? 'Kaydediliyor…' : bilgeTahtaEnabled ? 'Açık' : 'Kapalı'}
                  </button>
                </div>

                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--urgency)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--urgency-text)]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-black">Sınav modu</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
                        Açıkken bu sınıftaki bütün öğrencilerde Bilge Tahta, Bilge Çan ve Bilge Asistan
                        kapanır — sadece ödev ekranında değil, uygulamanın her yerinde. En fazla 4 saat
                        sonra kendiliğinden kapanır.
                      </p>
                      {examModeUntil && (
                        <p className="mt-1 text-xs font-bold text-[var(--urgency-text)]">
                          Kendiliğinden kapanış: {formatIstanbulDateTime(examModeUntil)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Sınav modu"
                    aria-checked={examModeEnabled}
                    disabled={examModeSaving}
                    onClick={() => void toggleExamMode()}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-black text-white disabled:opacity-60"
                    style={{ background: examModeEnabled ? 'var(--urgency-text)' : 'var(--text-muted)' }}
                  >
                    {examModeSaving ? 'Kaydediliyor…' : examModeEnabled ? 'Sınav açık' : 'Kapalı'}
                  </button>
                </div>
              </section>

              <section aria-labelledby="invite-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
                <h2 id="invite-title" className="flex items-center gap-2 text-lg font-black"><Link2 className="h-5 w-5 text-[var(--focus)]" aria-hidden="true" /> Özel davet</h2>
                <form onSubmit={issueInvite} className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-sm font-bold">Geçerlilik (saat)
                    <input type="number" min={1} max={168} value={inviteHours} onChange={(event) => { inviteRef.current = null; setInviteHours(Number(event.target.value)) }} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" />
                  </label>
                  <label className="text-sm font-bold">Kullanım sınırı
                    <input type="number" min={1} max={40} value={inviteMaxUses} onChange={(event) => { inviteRef.current = null; setInviteMaxUses(Number(event.target.value)) }} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" />
                  </label>
                  <button type="submit" disabled={issuingInvite} className="btn-primary mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-60">
                    <Link2 className="h-4 w-4" aria-hidden="true" /> {issuingInvite ? 'Hazırlanıyor...' : 'Davet oluştur'}
                  </button>
                </form>
                {invite && (
                  <div className="mt-4 rounded-xl border border-[var(--reward)]/30 bg-[var(--reward)]/5 p-4">
                    <p className="text-sm font-black">Bağlantıyı şimdi kopyala</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Ham davet yalnız bu yanıtta görünür; sayfayı yenileyince tekrar gösterilmez. Bağlantı tokeni URL fragment&apos;ındadır.</p>
                    <code className="mt-3 block overflow-x-auto rounded-lg bg-[var(--surface)] p-3 text-xs">{shareUrl}</code>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setAnnouncement('Davet bağlantısı panoya kopyalandı.')).catch(() => setAnnouncement('Bağlantı kopyalanamadı; metni elle seçebilirsin.'))}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-bold"
                      >
                        <Clipboard className="h-4 w-4" aria-hidden="true" /> Kopyala
                      </button>
                      <button type="button" onClick={() => void revokeInvite()} disabled={issuingInvite} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold text-[var(--urgency)] disabled:opacity-60">
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Daveti iptal et
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section aria-labelledby="publish-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
                <h2 id="publish-title" className="flex items-center gap-2 text-lg font-black"><BookPlus className="h-5 w-5 text-[var(--focus)]" aria-hidden="true" /> Filtrelerden ödev yayımla</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Tarayıcı soru kimliği veya cevap göndermez; aktif soru seçimini sunucu yapar ve veritabanı tekrar doğrular.</p>
                <form onSubmit={publish} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold sm:col-span-2">Ödev başlığı
                    <input value={title} onChange={(event) => { publishRef.current = null; setTitle(event.target.value) }} required minLength={1} maxLength={160} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" placeholder="Kesirler tekrar ödevi" />
                  </label>
                  <label className="text-sm font-bold">Ders
                    <select value={game} onChange={(event) => { publishRef.current = null; setGame(event.target.value as typeof game) }} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
                      {GAME_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-bold">Sınav
                    <select value={examRef} disabled={game === 'wordquest'} onChange={(event) => { publishRef.current = null; setExamRef(event.target.value as typeof examRef) }} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 disabled:opacity-60">
                      {EXAM_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-bold">Kategori (isteğe bağlı)
                    <input value={category} onChange={(event) => { publishRef.current = null; setCategory(event.target.value) }} maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" />
                  </label>
                  <label className="text-sm font-bold">Konu (isteğe bağlı)
                    <input value={topic} onChange={(event) => { publishRef.current = null; setTopic(event.target.value) }} maxLength={200} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" />
                  </label>
                  <label className="text-sm font-bold">Zorluk (isteğe bağlı)
                    <select value={difficulty} onChange={(event) => { publishRef.current = null; setDifficulty(event.target.value) }} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
                      <option value="">Tümü</option>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-bold">Soru sayısı
                    <input type="number" min={1} max={30} value={questionCount} onChange={(event) => { publishRef.current = null; setQuestionCount(Number(event.target.value)) }} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" />
                  </label>
                  <label className="text-sm font-bold">Açılış zamanı (İstanbul)
                    <input type="datetime-local" value={availableInput} onChange={(event) => { publishRef.current = null; setAvailableInput(event.target.value) }} required className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" />
                  </label>
                  <label className="text-sm font-bold">Son teslim (İstanbul)
                    <input type="datetime-local" value={dueInput} onChange={(event) => { publishRef.current = null; setDueInput(event.target.value) }} required className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3" />
                  </label>
                  <button type="submit" disabled={publishing || overview.activeStudents.length === 0} className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
                    <BookPlus className="h-4 w-4" aria-hidden="true" /> {publishing ? 'Yayımlanıyor...' : 'Aktif öğrencilere yayımla'}
                  </button>
                </form>
              </section>

              <section aria-labelledby="students-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
                <h2 id="students-title" className="text-lg font-black">Aktif öğrenciler</h2>
                {overview.activeStudents.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--text-sub)]">Henüz aktif öğrenci yok. Ödev yayımlamak için önce davet gönder.</p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {overview.activeStudents.map((student) => (
                      <li key={student.memberRef} className="rounded-xl border border-[var(--border)] p-3">
                        <p className="font-bold">{student.alias}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Katılım: {formatIstanbulDateTime(student.joinedAt)}</p>
                        {confirmingMember === student.memberRef ? (
                          <div className="mt-3 rounded-lg bg-[var(--urgency)]/5 p-2 text-sm">
                            <p>Erişimi ve yeni ilerleme paylaşımını hemen kes?</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="button" disabled={removingMember === student.memberRef} onClick={() => void removeMember(student.memberRef)} className="inline-flex min-h-11 items-center rounded-lg bg-[var(--urgency)] px-3 font-bold text-white disabled:opacity-60">Evet, çıkar</button>
                              <button type="button" onClick={() => setConfirmingMember(null)} className="inline-flex min-h-11 items-center rounded-lg px-3 font-bold">Vazgeç</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmingMember(student.memberRef)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--urgency)] hover:bg-[var(--urgency)]/5">
                            <UserMinus className="h-4 w-4" aria-hidden="true" /> Sınıftan çıkar
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="progress-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
                <h2 id="progress-title" className="text-lg font-black">Minimum ödev ilerlemesi</h2>
                {overview.assignments.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--text-sub)]">Henüz yayımlanmış ödev yok.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {overview.assignments.map((item) => (
                      <article key={item.id} className="rounded-xl border border-[var(--border)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div><h3 className="font-black">{item.title}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Son teslim: {formatIstanbulDateTime(item.dueAt)}</p></div>
                          <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-bold">{item.submittedCount}/{item.assignedCount} teslim</span>
                        </div>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                          {item.students.map((student) => (
                            <li key={student.memberRef} className="rounded-lg bg-[var(--surface)] p-3 text-sm">
                              <div className="flex items-center justify-between gap-2"><strong>{student.alias}</strong>{student.status === 'submitted' && <Check className="h-4 w-4 text-[var(--growth)]" aria-label="Teslim edildi" />}</div>
                              <p className="mt-1 text-xs text-[var(--text-sub)]">{student.status === 'submitted' ? `${student.answeredCount} yanıt · ${student.correctCount} doğru` : 'Henüz teslim edilmedi'}</p>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

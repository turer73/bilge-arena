'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  acceptTeacherClassroomInvitation,
  previewTeacherClassroomInvitation,
  TeacherClassroomClientError,
} from '@/lib/teacher-classroom/client'
import { teacherInviteTokenSchema, type TeacherInvitationPreview } from '@/lib/teacher-classroom/server-contract'
import { TEACHER_INVITE_SESSION_KEY } from '@/lib/teacher-classroom/invite-bootstrap'
import { formatIstanbulDateTime } from '@/lib/teacher-classroom/view-utils'

export function TeacherInvitationClient() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuthStore()
  const [token, setToken] = useState<string | null | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    let stagedToken: string | null = null
    try {
      stagedToken = window.sessionStorage.getItem(TEACHER_INVITE_SESSION_KEY)
      window.sessionStorage.removeItem(TEACHER_INVITE_SESSION_KEY)
    } catch {}
    const parsed = teacherInviteTokenSchema.safeParse(fragment.get('token') ?? stagedToken)
    return parsed.success ? parsed.data : null
  })
  const [preview, setPreview] = useState<TeacherInvitationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState(false)
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false)
  const [sharingConsent, setSharingConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const pendingRef = useRef<{ fingerprint: string; requestId: string } | null>(null)

  useEffect(() => {
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (!accepted) return
    const timer = window.setTimeout(() => router.replace('/arena/sinif'), 800)
    return () => window.clearTimeout(timer)
  }, [accepted, router])

  useEffect(() => {
    if (!user || !token) return
    const controller = new AbortController()
    previewTeacherClassroomInvitation(token, controller.signal)
      .then(setPreview)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadErrorStatus(error instanceof TeacherClassroomClientError ? error.status : 500)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, user])

  const accept = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token || !preview || !noticeAcknowledged || !sharingConsent || submitting) return
    const fingerprint = `${preview.notice.version}:${preview.sharingConsent.version}`
    const pending = pendingRef.current?.fingerprint === fingerprint
      ? pendingRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    pendingRef.current = pending
    setSubmitting(true)
    setSubmitError(false)
    try {
      await acceptTeacherClassroomInvitation({
        token,
        noticeVersion: preview.notice.version,
        noticeAcknowledged: true,
        sharingConsentVersion: preview.sharingConsent.version,
        sharingConsent: true,
        requestId: pending.requestId,
      })
      pendingRef.current = null
      setToken(null)
      setAccepted(true)
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || token === undefined || (user && Boolean(token) && loading)) {
    return (
      <div role="status" className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">
        Güvenli davet kontrol ediliyor...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <LockKeyhole className="mx-auto h-10 w-10 text-[var(--focus)]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">Davet için giriş yap</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
          Davet yalnız doğrulanmış hesabına bağlanır. Girişten sonra öğretmeninin bağlantısını yeniden aç.
        </p>
        <Link href="/giris" className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-xl px-7 text-sm font-bold">
          Giriş yap
        </Link>
      </div>
    )
  }

  if (accepted) {
    return (
      <div role="status" className="mx-auto max-w-md px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--growth)]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">Sınıfa katıldın</h1>
        <p className="mt-2 text-sm text-[var(--text-sub)]">Sınıflarım ekranına yönlendiriliyorsun.</p>
      </div>
    )
  }

  if (!token || !preview || loadErrorStatus) {
    const unavailable = loadErrorStatus === 404 || loadErrorStatus === 410
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <UserPlus className="mx-auto h-10 w-10 text-[var(--text-sub)]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">
          {unavailable ? 'Davet artık kullanılamıyor' : 'Davet bağlantısı geçersiz'}
        </h1>
        <p role="alert" className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
          {unavailable
            ? 'Davet süresi dolmuş, iptal edilmiş veya kullanım sınırına ulaşmış olabilir.'
            : 'Öğretmeninden yeni bir fragment bağlantısı iste veya bağlantıyı yeniden aç.'}
        </p>
        {token && loadErrorStatus && !unavailable && (
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setLoadErrorStatus(null)
              previewTeacherClassroomInvitation(token)
                .then(setPreview)
                .catch((error) => setLoadErrorStatus(
                  error instanceof TeacherClassroomClientError ? error.status : 500,
                ))
                .finally(() => setLoading(false))
            }}
            className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
          </button>
        )}
        <Link href="/arena/sinif" className="mt-5 inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-[var(--focus)]">
          Sınıflarıma dön
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-10">
      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm">
        <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-5 md:px-7">
          <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">ÖZEL SINIF DAVETİ</p>
          <h1 className="mt-1 text-2xl font-black">{preview.classroomName}</h1>
          <p className="mt-2 text-sm text-[var(--text-sub)]">Davet eden: {preview.teacherAlias}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Son kullanım: {formatIstanbulDateTime(preview.expiresAt)}</p>
        </div>

        <form onSubmit={accept} className="space-y-5 p-5 md:p-7">
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--growth)]/30 bg-[var(--growth)]/5 p-4 text-sm leading-6">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--growth)]" aria-hidden="true" />
            <p>
              Kurum yöneticisi ve sınıfın öğretmeni, katılımından sonraki çalışmalarından konu ve kazanım bazlı
              durum, skor, güven ve toplu çalışma göstergelerini görebilir. Ham cevaplarını, tek tek yanlış soru
              ayrıntılarını, e-postanı, profil UUID&apos;ni, telefonunu veya XP&apos;ni göremez.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-base font-black">1. Aydınlatma</legend>
            <p className="text-sm leading-6 text-[var(--text-sub)]">
              Veri işleme hakkında bilgi edinmek için{' '}
              <a href={preview.notice.href} target="_blank" rel="noreferrer" className="font-bold text-[var(--focus)] underline underline-offset-2">
                aydınlatma metnini yeni sekmede aç
              </a>.
            </p>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3 text-sm leading-6 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
              <input
                type="checkbox"
                checked={noticeAcknowledged}
                onChange={(event) => setNoticeAcknowledged(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--focus)]"
              />
              <span>Aydınlatma metnini okudum ve bilgilendirildim. Bu kutu bir açık rıza beyanı değildir.</span>
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-base font-black">2. Öğretmenle ilerleme paylaşımı</legend>
            <p className="text-sm leading-6 text-[var(--text-sub)]">
              Ayrı paylaşım koşullarını görmek için{' '}
              <a href={preview.sharingConsent.href} target="_blank" rel="noreferrer" className="font-bold text-[var(--focus)] underline underline-offset-2">
                paylaşım rızası metnini yeni sekmede aç
              </a>.
            </p>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3 text-sm leading-6 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
              <input
                type="checkbox"
                checked={sharingConsent}
                onChange={(event) => setSharingConsent(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--focus)]"
              />
              <span>Belirtilen sınıf ödev ilerlememin bu öğretmenle paylaşılmasına açık rıza veriyorum.</span>
            </label>
          </fieldset>

          <p className="rounded-xl bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--text-sub)]">
            Bu paylaşımı daha sonra Sınıflarım ekranından tek adımda durdurabilirsin. Durdurduğunda öğretmen kimliğini
            ve yeni ilerlemeni göremez; mevcut ödev erişimin de kesilir.
          </p>

          <button
            type="submit"
            disabled={!noticeAcknowledged || !sharingConsent || submitting}
            className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            {submitting ? 'Katılım kaydediliyor...' : 'Sınıfa katıl'}
          </button>
          {submitError && (
            <p role="alert" className="text-sm text-[var(--urgency)]">
              Katılım kaydedilemedi. Metinler güncellenmiş veya davet kullanılamıyor olabilir; sayfayı yenileyip tekrar dene.
            </p>
          )}
        </form>
      </section>
    </div>
  )
}

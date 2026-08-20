'use client'

import { Copy, Link2, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  issueTeacherClassroomInvite,
  revokeTeacherClassroomInvite,
} from '@/lib/teacher-classroom/client'
import type { TeacherInviteIssueResponse } from '@/lib/teacher-classroom/server-contract'

interface InstitutionStudentInviteDialogProps {
  classroomId: string
  classroomName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type StableRequest = { fingerprint: string; requestId: string }

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const subscribeToClientReady = () => () => {}

export function InstitutionStudentInviteDialog({
  classroomId,
  classroomName,
  open,
  onOpenChange,
}: InstitutionStudentInviteDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const clientReady = useSyncExternalStore(subscribeToClientReady, () => true, () => false)
  const [inviteHours, setInviteHours] = useState(24)
  const [maxUses, setMaxUses] = useState(10)
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState<TeacherInviteIssueResponse | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const issueRef = useRef<(StableRequest & { expiresAt: string }) | null>(null)
  const revokeRef = useRef<StableRequest | null>(null)

  useEffect(() => {
    setInvite(null)
    setAnnouncement('')
    issueRef.current = null
    revokeRef.current = null
  }, [classroomId])

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus()
    }
  }, [onOpenChange, open])

  async function createInvite(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    const fingerprint = `${classroomId}:${inviteHours}:${maxUses}`
    const pending = issueRef.current?.fingerprint === fingerprint
      ? issueRef.current
      : {
          fingerprint,
          requestId: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + inviteHours * 60 * 60 * 1000).toISOString(),
        }
    issueRef.current = pending
    setBusy(true)
    setAnnouncement('')
    try {
      const result = await issueTeacherClassroomInvite(classroomId, {
        expiresAt: pending.expiresAt,
        maxUses,
        requestId: pending.requestId,
      })
      setInvite(result)
      setAnnouncement('Öğrenci davet bağlantısı hazır. Bu ekrandan ayrılmadan kopyalayın.')
    } catch {
      setAnnouncement('Davet oluşturulamadı. Aynı ayarlarla güvenle yeniden deneyebilirsiniz.')
    } finally {
      setBusy(false)
    }
  }

  async function revokeInvite() {
    if (!invite || busy) return
    const pending = revokeRef.current?.fingerprint === invite.inviteRef
      ? revokeRef.current
      : { fingerprint: invite.inviteRef, requestId: crypto.randomUUID() }
    revokeRef.current = pending
    setBusy(true)
    try {
      await revokeTeacherClassroomInvite(invite.inviteRef, { requestId: pending.requestId })
      setInvite(null)
      issueRef.current = null
      revokeRef.current = null
      setAnnouncement('Davet iptal edildi.')
    } catch {
      setAnnouncement('Davet iptal edilemedi. Aynı istekle yeniden deneyebilirsiniz.')
    } finally {
      setBusy(false)
    }
  }

  const portalTarget = clientReady ? document.body : null
  if (!open || !portalTarget) return null

  const shareUrl = invite ? `${window.location.origin}${invite.sharePath}` : ''

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-end justify-center bg-slate-950/85 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
      data-testid="institution-student-invite-overlay"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[90dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-3xl border border-sky-400/25 bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-sky-300">
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Öğrenci ekleme
            </p>
            <h2 id={titleId} className="mt-1 truncate text-xl font-black sm:text-2xl">{classroomName}</h2>
            <p id={descriptionId} className="mt-1 text-sm text-[var(--text-sub)]">
              Bu sınıfa özel, süreli ve kullanımı sınırlı bir katılım bağlantısı oluşturun.
            </p>
          </div>
          <button
            type="button"
            data-initial-focus
            onClick={() => onOpenChange(false)}
            aria-label="Öğrenci ekleme penceresini kapat"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 hover:bg-white/10"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm leading-6">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
            <p>
              Öğrenci bağlantıyı kendi Bilge Arena hesabıyla açar; aydınlatma ve ilerleme paylaşımı
              adımlarını tamamladıktan sonra sınıfa katılır. E-posta veya kullanıcı kimliği bu ekrana gelmez.
            </p>
          </div>

          <form onSubmit={createInvite} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Geçerlilik süresi
              <select
                value={inviteHours}
                onChange={(event) => {
                  setInviteHours(Number(event.target.value))
                  issueRef.current = null
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[var(--bg)] px-3"
              >
                <option value={1}>1 saat</option>
                <option value={24}>24 saat</option>
                <option value={72}>3 gün</option>
                <option value={168}>7 gün</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              Kullanım sınırı
              <input
                type="number"
                min={1}
                max={40}
                value={maxUses}
                onChange={(event) => {
                  setMaxUses(Number(event.target.value))
                  issueRef.current = null
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[var(--bg)] px-3"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-60 sm:col-span-2"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Hazırlanıyor…' : invite ? 'Yeni davet oluştur' : 'Davet bağlantısı oluştur'}
            </button>
          </form>

          {announcement && (
            <p role="status" className="mt-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3 text-sm font-bold text-sky-100">
              {announcement}
            </p>
          )}

          {invite && (
            <section className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4" aria-label="Hazır öğrenci daveti">
              <p className="text-sm font-black">Bağlantıyı şimdi paylaşın</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
                Güvenli davet anahtarı yalnız bu yanıtta gösterilir. Sayfa yenilenirse yeni bağlantı oluşturmanız gerekir.
              </p>
              <code className="mt-3 block overflow-x-auto rounded-xl bg-black/20 p-3 text-xs">{shareUrl}</code>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(shareUrl)
                    .then(() => setAnnouncement('Davet bağlantısı panoya kopyalandı. WhatsApp veya e-postayla paylaşabilirsiniz.'))
                    .catch(() => setAnnouncement('Bağlantı kopyalanamadı; metni elle seçebilirsiniz.'))}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold hover:bg-white/5"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" /> Bağlantıyı kopyala
                </button>
                <button
                  type="button"
                  onClick={() => void revokeInvite()}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold text-red-200 hover:bg-red-400/10 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Daveti iptal et
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>,
    portalTarget,
  )
}

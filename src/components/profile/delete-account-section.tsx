'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { ACCOUNT_DELETION_CONFIRMATION } from '@/lib/account-deletion'
import { useAuthStore } from '@/stores/auth-store'

const buttonClass = 'min-h-11 rounded-xl border-2 px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-50'

export function DeleteAccountSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section data-profile-delete-account className="rounded-2xl border-2 border-[var(--app-danger-border)] bg-[var(--app-card)] p-4">
      <h2 className="mb-2 text-sm font-bold">Hesap ve veri yönetimi</h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--app-text-sub)]">
        Hesabını kapatmak ve kalıcı silme sürecini başlatmak istiyorsan aşağıdaki seçeneği kullan.
        İlk tıklama hesabını silmez; önce senden açık onay isteriz.
      </p>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass} w-full border-[var(--app-danger-border)] text-[var(--app-danger-ink)] hover:bg-[var(--app-danger-tint)]`}>
        <Trash2 size={16} aria-hidden="true" className="mr-2 inline" />
        Hesabımı kalıcı sil
      </button>
      {open && <DeleteAccountDialog userId={userId} onClose={() => setOpen(false)} />}
    </section>
  )
}

function DeleteAccountDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [confirmation, setConfirmation] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState<'closed' | 'partial' | 'unknown' | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const busy = useRef(false)
  const mounted = useRef(false)
  const headingId = useId()
  const descriptionId = useId()
  const inputId = useId()
  const hintId = useId()
  const canDelete = acknowledged && confirmation.trim() === ACCOUNT_DELETION_CONFIRMATION && !pending && !outcome

  useEffect(() => {
    mounted.current = true
    const dialog = dialogRef.current
    if (!returnFocus.current && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    if (dialog && !dialog.open) dialog.showModal()
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus({ preventScroll: true })
    return () => {
      mounted.current = false
      document.body.style.overflow = previousOverflow
      if (returnFocus.current?.isConnected) returnFocus.current.focus()
    }
  }, [])

  useEffect(() => {
    if (outcome) headingRef.current?.focus()
  }, [outcome])

  function cancel() {
    if (!busy.current && outcome !== 'closed' && outcome !== 'partial') onClose()
  }

  function containTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
    const first = elements[0]
    const last = elements.at(-1)
    const active = document.activeElement
    if (!first || !elements.includes(active as HTMLElement)
      || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
      event.preventDefault()
      const next = event.shiftKey ? last : first
      next?.focus()
      if (!first) event.currentTarget.focus()
    }
  }

  async function deleteAccount() {
    if (!canDelete || busy.current) return
    if (useAuthStore.getState().user?.id !== userId) {
      setError('Oturumundaki hesap değişti. Bu pencereyi kapatıp profil sayfasını yenile.')
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ confirmation: confirmation.trim(), acknowledged, expectedUserId: userId }),
      })
      const data = await response.json().catch(() => null)
      if (!mounted.current || useAuthStore.getState().user?.id !== userId) return
      if (data?.erasure?.profile === 'closed') {
        setOutcome(response.ok && data.erasure.authIdentity === 'scrubbed' ? 'closed' : 'partial')
        return
      }
      if (response.ok || response.status >= 500) {
        setOutcome('unknown')
        return
      }
      setError(response.status === 429
        ? 'Çok kısa sürede tekrar denedin. Birkaç dakika bekleyip yeniden dene.'
        : response.status === 401
          ? 'Oturumun sona ermiş. Yeniden giriş yaptıktan sonra bu işlemi onayla.'
          : response.status === 409
            ? 'Oturumundaki hesap değişti. Bu pencereyi kapatıp profil sayfasını yenile.'
            : 'Silme onayı doğrulanamadı. Açıklamayı onaylayıp istenen metni kontrol et.')
    } catch {
      // A lost response is not proof that the server performed no mutation.
      if (mounted.current && useAuthStore.getState().user?.id === userId) setOutcome('unknown')
    } finally {
      clearTimeout(timeout)
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }

  function clearClosedAccount() {
    const state = useAuthStore.getState()
    if (state.user?.id === userId) state.signOut()
    // A full navigation also discards the browser SDK's in-memory Auth cache.
    // Server global sign-out already expires the session cookies.
  }

  return (
    <dialog ref={dialogRef} tabIndex={-1} aria-labelledby={headingId} aria-describedby={descriptionId} aria-busy={pending} onKeyDown={containTab}
      onCancel={(event) => { event.preventDefault(); cancel() }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border-2 border-[var(--app-danger-border)] bg-[var(--app-card)] p-5 text-[var(--app-text)] shadow-2xl backdrop:bg-black/60">
      <div className="mb-3 flex items-center justify-between gap-3">
        <AlertTriangle size={28} aria-hidden="true" className="text-[var(--app-danger-ink)]" />
        {!outcome && (
          <button ref={cancelRef} type="button" onClick={cancel} disabled={pending} aria-label="Silme penceresini kapat"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--app-text-sub)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] disabled:opacity-50">
            <X size={22} aria-hidden="true" />
          </button>
        )}
      </div>
      <h2 ref={headingRef} tabIndex={-1} id={headingId} className="mb-3 text-lg font-bold">
        {outcome === 'closed' || outcome === 'partial' ? 'Hesabın kapatıldı' : outcome === 'unknown' ? 'İşlem sonucu doğrulanamadı' : 'Hesabını kalıcı silmek istiyor musun?'}
      </h2>
      {outcome ? (
        <div>
          <p id={descriptionId} role="status" className="mb-4 text-sm leading-relaxed text-[var(--app-text-sub)]">
            {outcome === 'closed'
              ? 'Hesabın kapatıldı, oturumların sonlandırıldı ve giriş kimlik bilgilerin temizlendi. Öğrenme/işlem kayıtları ve yedeklerin temizliği ayrıca değerlendirilir; tüm verilerinin silinmesi henüz tamamlanmış değildir.'
              : outcome === 'partial'
                ? 'Hesabın kapatıldı ancak oturum veya giriş kimlik temizliği tamamlanamadı. Kalan kayıtlar ve yedekler de henüz tamamen silinmedi. İşlemi sonuçlandırmamız için bize ulaş.'
                : 'Bağlantı ya da sunucu sorunu nedeniyle sonucu doğrulayamadık. Hesabın kapanmış olabilir; işlem yapılmadığını varsayma. Hesap durumunu kontrol et veya bize ulaş.'}
          </p>
          <a href="mailto:iletisim@bilgearena.com" className="mb-4 block break-all text-sm font-bold text-[var(--app-accent-text)] underline">iletisim@bilgearena.com</a>
          {outcome === 'unknown' ? (
            <button type="button" onClick={onClose} className={`${buttonClass} w-full border-[var(--app-border)]`}>Profilime dön</button>
          ) : (
            <a href="/giris?deleted=1" onClick={clearClosedAccount} className={`${buttonClass} block w-full border-[var(--app-border)] text-center`}>Giriş sayfasına dön</a>
          )}
        </div>
      ) : (
        <div>
          <p id={descriptionId} className="mb-3 text-sm leading-relaxed text-[var(--app-text-sub)]">
            Onayladığında hesabın kapatılır, oturumların sonlandırılır ve giriş kimlik bilgilerin temizlenir.
            Hesap kapatma ve kimlik temizliği geri alınamaz; bu hesabı ve ilerlemeni yeniden kullanamazsın.
          </p>
          <p className="mb-4 rounded-xl bg-[var(--app-danger-tint)] p-3 text-xs leading-relaxed text-[var(--app-danger-ink)]">
            Öğrenme/işlem kayıtları ve yedeklerin temizliği ayrı değerlendirilir.
            Bu işlem tüm kopyaların aynı anda yok edildiği anlamına gelmez.
          </p>
          <label className="mb-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input type="checkbox" checked={acknowledged} disabled={pending} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--app-danger-strong)]" />
            <span>Hesabımın kapanacağını ve bu işlemi geri alamayacağımı anladım.</span>
          </label>
          <label htmlFor={inputId} className="mb-2 block text-sm font-bold">Onaylamak için {ACCOUNT_DELETION_CONFIRMATION} yaz</label>
          <input id={inputId} type="text" value={confirmation} disabled={pending} maxLength={40} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
            aria-describedby={hintId} onChange={(event) => setConfirmation(event.target.value)}
            className="mb-2 min-h-11 w-full rounded-xl border-2 border-[var(--app-text-sub)] bg-[var(--app-bg)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]" />
          <p id={hintId} className="mb-4 text-xs text-[var(--app-text-sub)]">Buton yalnız onay kutusu ve yazılı doğrulama tamamlandığında açılır.</p>
          {error && <p role="alert" className="mb-4 text-sm text-[var(--app-danger-ink)]">{error}</p>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={cancel} disabled={pending} className={`${buttonClass} flex-1 border-[var(--app-text-muted)]`}>Vazgeç, hesabımı koru</button>
            <button type="button" onClick={deleteAccount} disabled={!canDelete} className={`${buttonClass} flex-1 border-[var(--app-danger-strong)] bg-[var(--app-danger-strong)] text-white`}>
              {pending ? 'Hesabın kapatılıyor…' : 'Evet, hesabımı kalıcı sil'}
            </button>
          </div>
          {pending && <p role="status" className="mt-3 text-xs text-[var(--app-text-sub)]">İşlem sürüyor. Sonuç doğrulanana kadar bekle.</p>}
        </div>
      )}
    </dialog>
  )
}

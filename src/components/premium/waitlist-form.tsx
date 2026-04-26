'use client'

/**
 * WaitlistForm
 * --------------------------------------------------------------
 * /arena/premium sayfasindaki "Lansman Bildirim Al" formunun client komponenti.
 *
 * Akis:
 *   1. User email girer + KVKK checkbox isaretler
 *   2. Submit butonu yalnizca her ikisi de gecerliyken aktif
 *   3. POST /api/premium/waitlist
 *   4. 200 -> success state (formu degistirir, plausible PremiumUpsell event)
 *   5. 429 -> rate-limit mesaji
 *   6. 400 -> validation mesaji (sunucu zod hatalari)
 *   7. 5xx / network -> generic baglanti mesaji + retry tetigi
 *
 * KVKK notu: kvkkConsent state false ise submit butonu disabled
 * kalir; ek olarak sunucu zod schemasi literal(true) zorunlu kilar.
 * Frontend kontrolu UX, sunucu kontrolu hukuki kanit.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/utils/plausible'

interface WaitlistFormProps {
  /** Hangi plan butonundan geldigini belirler -- /api/premium/waitlist body'sinde gonderilir. */
  plan: 'monthly' | 'yearly'
  /** Submit body'sine eklenir; default '/arena/premium'. */
  source?: string
  /** Success/error sonrasi modal/dialog kapatma callback. Optional. */
  onClose?: () => void
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function WaitlistForm({
  plan,
  source = '/arena/premium',
  onClose,
}: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [kvkkConsent, setKvkkConsent] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Frontend validation: email >= 5 char (zod min) + KVKK isaretli
  // Sunucu zod tekrar dogrular -- bu sadece UX gating.
  const isValid =
    email.trim().length >= 5 && email.includes('@') && kvkkConsent
  const isSubmitting = status === 'submitting'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || isSubmitting) return

    setStatus('submitting')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/premium/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          plan,
          kvkkConsent: true,
          source,
        }),
      })

      if (res.ok) {
        // Plausible event: PremiumUpsell + props.action='waitlist_submit'
        // Mevcut event union'da PremiumUpsell var; yeni bir event eklemek
        // yerine props.action ile alt-tip olusturuyoruz.
        trackEvent('PremiumUpsell', {
          props: { plan, action: 'waitlist_submit' },
        })
        setStatus('success')
        return
      }

      // Hata patikalari: kullanici-dostu Turkce mesaj
      if (res.status === 429) {
        setErrorMsg(
          'Çok fazla istek geldi. Lütfen birkaç dakika sonra tekrar dene.'
        )
      } else if (res.status === 400) {
        setErrorMsg(
          'Geçersiz girdi. Lütfen e-posta adresini ve KVKK onayını kontrol et.'
        )
      } else {
        setErrorMsg('Bir sorun oluştu. Lütfen birazdan tekrar dene.')
      }
      setStatus('error')
    } catch {
      // Network/fetch reject -- internet yok, CORS, etc.
      setErrorMsg('Bağlantı hatası. Lütfen tekrar dene.')
      setStatus('error')
    }
  }

  // Success state: formu degistirir
  if (status === 'success') {
    const planLabel = plan === 'monthly' ? 'aylık' : 'yıllık'
    return (
      <div
        className="rounded-2xl border border-emerald-300/40 bg-emerald-50/80 p-6 text-center dark:border-emerald-700/40 dark:bg-emerald-950/40"
        role="status"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
          Teşekkürler! Listene eklendin.
        </h3>
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
          <strong>{email.trim()}</strong> adresine, Premium {planLabel} planı
          lansmanı yayınlandığında ilk olarak haber vereceğiz.
        </p>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={onClose}
          >
            Kapat
          </Button>
        )}
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4"
      aria-label="Premium lansman bildirim formu"
    >
      <div>
        <label
          htmlFor="waitlist-email"
          className="block text-sm font-medium text-foreground"
        >
          E-posta
        </label>
        <input
          id="waitlist-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            // Yazmaya baslayinca eski hatayi temizle
            if (status === 'error') {
              setStatus('idle')
              setErrorMsg(null)
            }
          }}
          placeholder="ornek@eposta.com"
          className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="waitlist-kvkk"
          type="checkbox"
          checked={kvkkConsent}
          onChange={(e) => setKvkkConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
          disabled={isSubmitting}
          aria-describedby="waitlist-kvkk-desc"
        />
        <label
          htmlFor="waitlist-kvkk"
          id="waitlist-kvkk-desc"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          <a
            href="/kvkk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            KVKK Aydınlatma Metni
          </a>
          ’ni okudum; e-posta adresimin Premium lansman bildirimi için işlenmesine
          açık rıza veriyorum.
        </label>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {errorMsg}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={!isValid || isSubmitting}
        className="w-full"
      >
        {isSubmitting ? 'Gönderiliyor…' : 'Beni Bildirim Listesine Ekle'}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        Spam yok. İstediğin zaman çıkabilirsin.
      </p>
    </form>
  )
}

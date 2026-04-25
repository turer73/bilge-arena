'use client'

import { useEffect, useState } from 'react'
import { PREMIUM_FEATURES, PREMIUM_PRICE } from '@/lib/constants/premium'
import { useAuthStore } from '@/stores/auth-store'
import { WaitlistForm } from '@/components/premium/waitlist-form'
import { trackEvent } from '@/lib/utils/plausible'

type WaitlistPlan = 'monthly' | 'yearly'

export default function PremiumClient() {
  const { profile, user } = useAuthStore()
  const isPremium = profile?.is_premium === true

  // Waitlist dialog state -- null = kapali, plan = acik (hangi plan icin)
  const [waitlistPlan, setWaitlistPlan] = useState<WaitlistPlan | null>(null)

  function openWaitlist(plan: WaitlistPlan) {
    setWaitlistPlan(plan)
    // Funnel: dialog_opened -> waitlist_submit (form'un kendi event'i)
    trackEvent('PremiumUpsell', {
      props: { plan, action: 'dialog_opened' },
    })
  }

  function closeWaitlist() {
    setWaitlistPlan(null)
  }

  // ESC ile dialog kapat -- a11y + signup-prompt-modal pattern uyumu
  useEffect(() => {
    if (!waitlistPlan) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeWaitlist()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [waitlistPlan])

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Baslik */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-black md:text-4xl">
          ⭐ Bilge Arena <span className="text-[var(--reward)]">Premium</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-sub)] md:text-base">
          Sınırsız öğrenme deneyimi ile YKS hedefine ulaş
        </p>
      </div>

      {/* Zaten premium */}
      {isPremium && (
        <div className="mb-6 rounded-xl border border-[var(--growth-border)] bg-[var(--growth-bg)] p-4 text-center">
          <div className="text-lg font-bold text-[var(--growth)]">✅ Premium Üyesin!</div>
          <div className="mt-1 text-xs text-[var(--text-sub)]">
            {profile?.premium_until
              ? `Üyeliğin ${new Date(profile.premium_until).toLocaleDateString('tr-TR')} tarihine kadar geçerli.`
              : 'Sınırsız premium erişimin var.'}
          </div>
        </div>
      )}

      {/* Ozellikler */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PREMIUM_FEATURES.map((feat, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 transition-all hover:border-[var(--reward-border)] hover:shadow-lg"
          >
            <div className="mb-2 text-2xl">{feat.icon}</div>
            <div className="text-sm font-bold">{feat.title}</div>
            <div className="mt-1 text-[11px] text-[var(--text-sub)]">{feat.description}</div>
          </div>
        ))}
      </div>

      {/* Fiyatlandirma */}
      {!isPremium && (
        <>
          {/* Lansman bildirim banner -- "yakinda" durumunu durust acikla */}
          <div className="mb-6 rounded-xl border border-[var(--reward-border)] bg-[var(--reward-bg)] p-4 text-center">
            <div className="text-sm font-bold text-[var(--reward)]">
              🚀 Premium çok yakında geliyor!
            </div>
            <div className="mt-1 text-xs text-[var(--text-sub)]">
              Şimdi planını seç ve bildirim listesine eklen — ödeme entegrasyonu
              hazır olduğunda ilk haberdar olanlardan ol.
            </div>
          </div>

          <h2 className="mb-4 text-center font-display text-lg font-bold">Planını Seç</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Aylik */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-center transition-all hover:shadow-lg">
              <div className="text-xs font-bold tracking-wider text-[var(--text-sub)]">AYLIK</div>
              <div className="mt-2 font-display text-3xl font-black">{PREMIUM_PRICE.label.monthly}</div>
              <div className="mt-1 text-[11px] text-[var(--text-sub)]">Her ay yenilenir</div>
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-[var(--focus)] py-3 text-sm font-bold text-white transition-all hover:bg-[var(--focus-light)] hover:scale-[1.02]"
                onClick={() => openWaitlist('monthly')}
              >
                Lansman Bildirim Listesine Eklen
              </button>
            </div>

            {/* Yillik */}
            <div className="relative rounded-2xl border-2 border-[var(--reward)] bg-[var(--card-bg)] p-6 text-center transition-all hover:shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--reward)] px-4 py-1 text-[10px] font-bold text-white">
                🔥 EN POPÜLER — {PREMIUM_PRICE.label.yearlySaving}
              </div>
              <div className="text-xs font-bold tracking-wider text-[var(--text-sub)]">YILLIK</div>
              <div className="mt-2 font-display text-3xl font-black text-[var(--reward)]">
                {PREMIUM_PRICE.label.yearly}
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-sub)]">Ayda sadece ₺33,3</div>
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-[var(--reward)] py-3 text-sm font-bold text-white transition-all hover:brightness-110 hover:scale-[1.02]"
                onClick={() => openWaitlist('yearly')}
              >
                Lansman Bildirim Listesine Eklen
              </button>
            </div>
          </div>

          {/* Giris yap uyarisi -- waitlist icin login gerekmez ama notu koruyoruz */}
          {!user && (
            <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
              <div className="text-xs text-[var(--text-sub)]">
                Lansman sonrası satın alma için{' '}
                <a href="/giris" className="font-bold text-[var(--focus)] hover:underline">
                  giriş yapman
                </a>{' '}
                gerekecek. Şimdi sadece email yeterli.
              </div>
            </div>
          )}

          {/* SSS -- "yakinda" durumuna uyumlu hale getirildi */}
          <div className="mt-10">
            <h3 className="mb-4 text-center font-display text-base font-bold">Sıkça Sorulan Sorular</h3>
            <div className="space-y-3">
              {[
                {
                  q: 'Premium ne zaman aktif olacak?',
                  a: 'Ödeme entegrasyonu üzerinde çalışıyoruz. Bildirim listesine eklenirsen tarihi açıkladığımız ilk dakikada haber veririz.',
                },
                {
                  q: 'Listeye eklenmek beni bağlar mı?',
                  a: 'Hayır. Sadece email adresini saklıyoruz, otomatik ödeme kurulmuyor. Lansmanda istemezsen satın almazsın.',
                },
                {
                  q: 'Hangi ödeme yöntemleri olacak?',
                  a: 'Lansmanda kredi kartı, banka kartı ve mobil ödeme planlanıyor. Kesin liste lansmana yakın paylaşılacak.',
                },
              ].map((item, i) => (
                <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
                  <div className="text-sm font-bold">{item.q}</div>
                  <div className="mt-1 text-[11px] text-[var(--text-sub)]">{item.a}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Waitlist dialog -- minimal, role=dialog + backdrop + ESC ile kapanir */}
      {waitlistPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="waitlist-dialog-title"
        >
          {/* Backdrop -- click ile kapatir */}
          <button
            type="button"
            aria-label="Kapat"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeWaitlist}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 shadow-2xl">
            <button
              type="button"
              aria-label="Kapat"
              onClick={closeWaitlist}
              className="absolute right-3 top-3 rounded-lg p-1 text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)] hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h2
              id="waitlist-dialog-title"
              className="mb-2 font-display text-xl font-black"
            >
              {waitlistPlan === 'monthly' ? 'Aylık' : 'Yıllık'} plan için bildirim al
            </h2>
            <p className="mb-4 text-xs text-[var(--text-sub)]">
              Premium lansmanı yayınlandığında ilk haber alanlardan ol.
            </p>
            <WaitlistForm plan={waitlistPlan} onClose={closeWaitlist} />
          </div>
        </div>
      )}
    </div>
  )
}

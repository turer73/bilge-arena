'use client'

import { PREMIUM_FEATURES, PREMIUM_PRICE } from '@/lib/constants/premium'
import { useAuthStore } from '@/stores/auth-store'

export default function PremiumClient() {
  const { profile, user } = useAuthStore()
  const isPremium = profile?.is_premium === true

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
          <h2 className="mb-4 text-center font-display text-lg font-bold">Planını Seç</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Aylik */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-center transition-all hover:shadow-lg">
              <div className="text-xs font-bold tracking-wider text-[var(--text-sub)]">AYLIK</div>
              <div className="mt-2 font-display text-3xl font-black">{PREMIUM_PRICE.label.monthly}</div>
              <div className="mt-1 text-[11px] text-[var(--text-sub)]">Her ay yenilenir</div>
              <button
                className="mt-4 w-full rounded-xl bg-[var(--focus)] py-3 text-sm font-bold text-white transition-all hover:bg-[var(--focus-light)] hover:scale-[1.02]"
                onClick={() => {
                  alert('Ödeme entegrasyonu yakında aktif olacak!')
                }}
              >
                Başla — 7 gün ücretsiz
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
                className="mt-4 w-full rounded-xl bg-[var(--reward)] py-3 text-sm font-bold text-white transition-all hover:brightness-110 hover:scale-[1.02]"
                onClick={() => {
                  alert('Ödeme entegrasyonu yakında aktif olacak!')
                }}
              >
                Başla — 7 gün ücretsiz
              </button>
            </div>
          </div>

          {/* Giris yap uyarisi */}
          {!user && (
            <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
              <div className="text-xs text-[var(--text-sub)]">
                Premium satın almak için önce{' '}
                <a href="/giris" className="font-bold text-[var(--focus)] hover:underline">
                  giriş yapman
                </a>{' '}
                gerekiyor.
              </div>
            </div>
          )}

          {/* SSS */}
          <div className="mt-10">
            <h3 className="mb-4 text-center font-display text-base font-bold">Sıkça Sorulan Sorular</h3>
            <div className="space-y-3">
              {[
                {
                  q: 'Ücretsiz deneme nasıl çalışır?',
                  a: '7 gün boyunca tüm Premium özellikleri ücretsiz kullanabilirsin. İstediğin zaman iptal et, ücret alınmaz.',
                },
                {
                  q: 'İstediğim zaman iptal edebilir miyim?',
                  a: 'Evet! Profil ayarlarından tek tıkla iptal edebilirsin. Kalan süren sonuna kadar devam eder.',
                },
                {
                  q: 'Hangi ödeme yöntemlerini kabul ediyorsunuz?',
                  a: 'Kredi kartı, banka kartı ve mobil ödeme yöntemlerini kabul ediyoruz.',
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
    </div>
  )
}

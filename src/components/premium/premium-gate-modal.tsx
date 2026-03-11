'use client'

import { FEATURES, PREMIUM_FEATURES, PREMIUM_PRICE } from '@/lib/constants/premium'

interface PremiumGateModalProps {
  isOpen: boolean
  onClose: () => void
  reason?: 'quiz_limit' | 'chat_limit' | 'feature_locked'
}

const REASON_TITLES: Record<string, { title: string; subtitle: string }> = {
  quiz_limit: {
    title: '⏳ Günlük Limitin Doldu!',
    subtitle: 'Premium ile sınırsız quiz çöz',
  },
  chat_limit: {
    title: '💬 Mesaj Limitin Doldu!',
    subtitle: 'Premium ile Bilge Asistan\'la sınırsız konuş',
  },
  feature_locked: {
    title: '🔒 Premium Özellik',
    subtitle: 'Bu özelliği kullanmak için Premium\'a geç',
  },
}

/**
 * Premium upsell modali.
 * FEATURES.PREMIUM_UPSELL false iken render edilmez.
 */
export function PremiumGateModal({ isOpen, onClose, reason = 'quiz_limit' }: PremiumGateModalProps) {
  if (!FEATURES.PREMIUM_UPSELL) return null
  if (!isOpen) return null

  const { title, subtitle } = REASON_TITLES[reason] || REASON_TITLES.quiz_limit

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md animate-scaleIn rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 shadow-2xl">
        {/* Kapat */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-[var(--text-sub)] transition-colors hover:text-[var(--text)]"
        >
          ✕
        </button>

        {/* Baslik */}
        <div className="mb-5 text-center">
          <h2 className="font-display text-xl font-black">{title}</h2>
          <p className="mt-1 text-sm text-[var(--text-sub)]">{subtitle}</p>
        </div>

        {/* Ozellikler listesi */}
        <div className="mb-5 space-y-2.5">
          {PREMIUM_FEATURES.map((feat, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg bg-[var(--surface)] p-2.5">
              <span className="text-lg">{feat.icon}</span>
              <div>
                <div className="text-xs font-bold">{feat.title}</div>
                <div className="text-[10px] text-[var(--text-sub)]">{feat.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Fiyat butonlari */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              // TODO: Odeme entegrasyonu
              window.location.href = '/arena/premium'
            }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-center transition-all hover:border-[var(--focus)] hover:bg-[var(--focus-bg)]"
          >
            <div className="font-display text-lg font-black text-[var(--text)]">
              {PREMIUM_PRICE.label.monthly}
            </div>
            <div className="text-[10px] text-[var(--text-sub)]">Aylık</div>
          </button>

          <button
            onClick={() => {
              // TODO: Odeme entegrasyonu
              window.location.href = '/arena/premium'
            }}
            className="relative rounded-xl border-2 border-[var(--reward)] bg-[var(--reward-bg)] px-3 py-3 text-center transition-all hover:scale-[1.02]"
          >
            <div className="absolute -top-2 right-2 rounded-full bg-[var(--reward)] px-2 py-0.5 text-[8px] font-bold text-white">
              {PREMIUM_PRICE.label.yearlySaving}
            </div>
            <div className="font-display text-lg font-black text-[var(--reward)]">
              {PREMIUM_PRICE.label.yearly}
            </div>
            <div className="text-[10px] text-[var(--text-sub)]">Yıllık</div>
          </button>
        </div>

        {/* Alt not */}
        <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
          İstediğin zaman iptal edebilirsin. 7 gün ücretsiz dene!
        </p>
      </div>
    </div>
  )
}

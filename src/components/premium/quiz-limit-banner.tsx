'use client'

import Link from 'next/link'
import { FEATURES, FREE_DAILY_LIMIT } from '@/lib/constants/premium'

interface QuizLimitBannerProps {
  remaining: number
  isPremium: boolean
  isGuest: boolean
}

/**
 * Lobby'de kalan quiz hakkini gosteren banner.
 * FEATURES.QUIZ_LIMIT false iken render edilmez.
 */
export function QuizLimitBanner({ remaining, isPremium, isGuest }: QuizLimitBannerProps) {
  if (!FEATURES.QUIZ_LIMIT) return null
  if (isPremium || isGuest) return null

  const isLow = remaining <= 2 && remaining > 0
  const isEmpty = remaining === 0

  return (
    <div
      className="animate-fadeUp rounded-xl border px-4 py-3 text-center"
      style={{
        borderColor: isEmpty
          ? 'color-mix(in srgb, var(--urgency) 35%, transparent)'
          : isLow
            ? 'color-mix(in srgb, var(--reward) 30%, transparent)'
            : 'color-mix(in srgb, var(--focus) 20%, transparent)',
        background: isEmpty
          ? 'color-mix(in srgb, var(--urgency) 8%, transparent)'
          : isLow
            ? 'color-mix(in srgb, var(--reward) 6%, transparent)'
            : 'color-mix(in srgb, var(--focus) 5%, transparent)',
      }}
    >
      {isEmpty ? (
        <div>
          <div className="text-sm font-bold text-[var(--urgency)]">
            ⏳ Günlük limitin doldu!
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-sub)]">
            Yarın tekrar gelebilir veya Premium&apos;a geçerek sınırsız oynayabilirsin.
          </div>
          <Link
            href="/arena/premium"
            className="mt-2 inline-block rounded-lg bg-[var(--reward)] px-4 py-1.5 text-[11px] font-bold text-white transition-transform hover:scale-[1.03]"
          >
            ⭐ Premium&apos;a Geç
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-sub)]">
            Bugün kalan hak:
          </span>
          <span
            className="font-display text-lg font-black"
            style={{
              color: isLow ? 'var(--reward)' : 'var(--focus)',
            }}
          >
            {remaining}/{FREE_DAILY_LIMIT}
          </span>
        </div>
      )}
    </div>
  )
}

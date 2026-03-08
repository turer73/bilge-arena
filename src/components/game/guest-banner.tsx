'use client'

import Link from 'next/link'

export function GuestBanner() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--reward-border)] bg-[var(--reward-bg)] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm">👤</span>
        <span className="text-xs text-[var(--reward)]">
          Misafir olarak oynuyorsun — ilerlemenin kaydedilmesi için giriş yap
        </span>
      </div>
      <Link
        href="/giris"
        className="rounded-lg bg-[var(--reward)] px-3 py-1 text-[10px] font-bold text-white transition-opacity hover:opacity-90"
      >
        Giriş Yap
      </Link>
    </div>
  )
}

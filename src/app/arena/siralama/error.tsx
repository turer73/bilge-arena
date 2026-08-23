'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SiralamaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'siralama' } })
  }, [error])

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center bg-[var(--app-bg)] px-4 py-8 text-center lg:min-h-[60vh] lg:bg-transparent">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[26px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-6 shadow-[0_6px_0_var(--app-border)] md:gap-5">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-4xl">🏆</div>
      <h1 className="text-xl font-black md:text-2xl">Sıralama Yüklenemedi</h1>
      <p className="max-w-[360px] text-xs font-semibold leading-relaxed text-[var(--app-text-sub)] md:text-sm">
        Sıralama tablosu yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--text-muted)]">Hata kodu: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <Button variant="ghost" size="sm" onClick={reset}>
          Tekrar Dene
        </Button>
        <Link href="/arena">
          <Button variant="primary" size="sm">
            Arena&apos;ya Dön
          </Button>
        </Link>
      </div>
      </div>
    </div>
  )
}

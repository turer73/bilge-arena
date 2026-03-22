'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ProfilError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'profil' } })
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center md:gap-6">
      <div className="text-5xl">👤</div>
      <h1 className="text-xl font-bold md:text-2xl">Profil Yüklenemedi</h1>
      <p className="max-w-[360px] text-xs leading-relaxed text-[var(--text-sub)] md:text-sm">
        Profil bilgileri yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.
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
  )
}

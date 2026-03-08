'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ArenaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center md:gap-6 md:px-6">
      <div className="text-4xl md:text-5xl xl:text-6xl">🎮</div>
      <h1 className="text-xl font-bold md:text-2xl xl:text-3xl">Oyun Hatasi</h1>
      <p className="max-w-[360px] text-xs leading-relaxed text-[var(--text-sub)] md:max-w-[400px] md:text-sm xl:text-base">
        Oyun sirasinda bir hata olustu. Lutfen tekrar deneyin.
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
            Arena&apos;ya Don
          </Button>
        </Link>
      </div>
    </div>
  )
}

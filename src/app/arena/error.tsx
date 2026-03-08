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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-5xl">🎮</div>
      <h1 className="text-2xl font-bold">Oyun Hatasi</h1>
      <p className="max-w-[400px] text-sm leading-relaxed text-[var(--text-sub)]">
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

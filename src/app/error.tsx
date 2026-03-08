'use client'

import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-2xl font-bold">Bir Hata Olustu</h1>
      <p className="max-w-[400px] text-sm leading-relaxed text-[var(--text-sub)]">
        Beklenmeyen bir hata meydana geldi. Lutfen sayfayi yenileyin veya daha sonra tekrar
        deneyin.
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--text-muted)]">Hata kodu: {error.digest}</p>
      )}
      <Button variant="primary" size="sm" onClick={reset}>
        Tekrar Dene
      </Button>
    </div>
  )
}

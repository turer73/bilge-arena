'use client'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl">🛠️</div>
      <h2 className="text-lg font-bold">Admin Panelinde Hata</h2>
      <p className="max-w-[360px] text-sm leading-relaxed text-[var(--text-sub)]">
        Admin panelinde beklenmeyen bir hata olustu. Lutfen sayfayi yenileyin veya daha sonra tekrar deneyin.
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--text-muted)]">Hata kodu: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-lg bg-[var(--focus)] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
      >
        Tekrar Dene
      </button>
    </div>
  )
}

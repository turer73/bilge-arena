'use client'

interface PersonalizedMockCardProps {
  loading: boolean
  error: string | null
  onStart: () => void
}

export function PersonalizedMockCard({ loading, error, onStart }: PersonalizedMockCardProps) {
  return (
    <div
      className="animate-fadeUp overflow-hidden rounded-[20px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-shadow-accent)]"
      style={{ animationDelay: '0.32s', animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between border-b-2 border-[var(--app-border-soft)] bg-[var(--app-accent-tint)] px-3 py-2.5">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--app-text-sub)]">
          AKILLI DENEME
        </span>
        <span className="rounded-lg bg-[var(--app-card)] px-2 py-1 text-[10px] font-black text-[var(--app-accent-text)]">40 SORU</span>
      </div>

      <div className="px-3 py-3">
        <p className="mb-3 text-[11px] font-semibold leading-4 text-[var(--app-text-sub)]">
          Açık yanlışların ve yeterli kanıt bulunan zayıf konuların önce seçilir; kalan sorular bu dersin aktif havuzundan tamamlanır. Başlangıç tanılaması değildir.
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={loading}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--app-accent)] px-3 py-2 text-xs font-black tracking-wide text-white shadow-[0_4px_0_var(--app-accent-strong)] transition-all active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? 'Deneme hazırlanıyor...' : '🎯 Akıllı Denemeyi Başlat'}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-center text-[10px] text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

'use client'

interface PersonalizedMockCardProps {
  loading: boolean
  error: string | null
  onStart: () => void
}

export function PersonalizedMockCard({ loading, error, onStart }: PersonalizedMockCardProps) {
  return (
    <div
      className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]"
      style={{ animationDelay: '0.32s', animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          AKILLI DENEME
        </span>
        <span className="text-[10px] font-bold text-[var(--focus)]">40 SORU</span>
      </div>

      <div className="px-3 py-3">
        <p className="mb-3 text-[11px] text-[var(--text-sub)]">
          Açık yanlışların, zayıf konuların ve sınav kapsamın dengelenerek sana özel hazırlanır.
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={loading}
          className="btn-primary w-full rounded-[10px] py-2 text-xs font-bold tracking-wide transition-transform hover:scale-[1.02] disabled:cursor-wait disabled:opacity-60"
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

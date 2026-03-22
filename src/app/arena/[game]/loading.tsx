export default function GameLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Game header skeleton */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-[var(--border)]" />
        <div>
          <div className="h-6 w-40 animate-pulse rounded bg-[var(--border)]" />
          <div className="mt-1 h-3 w-56 animate-pulse rounded bg-[var(--border)]" />
        </div>
      </div>

      {/* Mode selector skeleton */}
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-24 animate-pulse rounded-xl bg-[var(--border)]"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      {/* Quiz card skeleton */}
      <div className="h-80 animate-pulse rounded-2xl bg-[var(--border)]" />
    </div>
  )
}

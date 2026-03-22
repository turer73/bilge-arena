export default function ArenaLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Page title skeleton */}
      <div className="mb-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-[var(--border)]" />
      </div>

      {/* Game cards grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-2xl bg-[var(--border)]"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      {/* Title skeleton */}
      <div className="mb-6">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-[var(--border)]" />
      </div>

      {/* Stats grid skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl bg-[var(--border)]"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg bg-[var(--border)]"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

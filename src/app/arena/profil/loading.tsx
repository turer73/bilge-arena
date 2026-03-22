export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Avatar + name skeleton */}
      <div className="mb-8 flex items-center gap-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-[var(--border)]" />
        <div>
          <div className="h-6 w-36 animate-pulse rounded bg-[var(--border)]" />
          <div className="mt-1 h-4 w-24 animate-pulse rounded bg-[var(--border)]" />
        </div>
      </div>

      {/* Stats grid skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-[var(--border)]"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--border)]" />
    </div>
  )
}

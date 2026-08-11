export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-2xl px-3 pt-4 pb-8 sm:px-4 sm:pt-6 md:max-w-3xl md:py-8 xl:max-w-4xl xl:px-6 xl:py-10 2xl:max-w-5xl">
      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 md:mb-6 md:p-6">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="h-[52px] w-[52px] animate-pulse rounded-full bg-[var(--border)]" />
          <div className="min-w-0">
            <div className="h-5 w-28 max-w-full animate-pulse rounded bg-[var(--border)]" />
            <div className="mt-1 h-3 w-20 animate-pulse rounded bg-[var(--border)]" />
          </div>
          <div className="h-8 w-14 animate-pulse rounded-full bg-[var(--border)]" />
          <div className="col-span-3 h-[66px] animate-pulse rounded-xl bg-[var(--border)]" />
          <div className="col-span-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--border)]" />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[5.25rem] animate-pulse rounded-xl bg-[var(--border)] sm:h-24"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--border)]" />
    </div>
  )
}

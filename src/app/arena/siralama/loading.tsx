export default function LeaderboardLoading() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[1180px] bg-[var(--app-bg)] px-3 py-4 md:px-5 lg:bg-transparent lg:px-6 lg:py-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <div className="h-44 animate-pulse rounded-[24px] bg-[var(--app-border)]" />
      <div className="hidden h-44 animate-pulse rounded-[24px] bg-[var(--app-border)] lg:block" />
      </div>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <div className="order-2 flex flex-col gap-2 lg:order-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl bg-[var(--border)]"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
      <div className="order-1 h-16 animate-pulse rounded-[18px] bg-[var(--app-border)] lg:order-2 lg:h-36" />
      </div>
    </div>
  )
}

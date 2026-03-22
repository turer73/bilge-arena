export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Title skeleton */}
      <div className="mb-6 text-center">
        <div className="mx-auto h-8 w-52 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="mx-auto mt-2 h-4 w-72 animate-pulse rounded bg-[var(--border)]" />
      </div>

      {/* Leaderboard rows skeleton */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl bg-[var(--border)]"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

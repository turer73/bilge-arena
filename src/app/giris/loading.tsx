export default function GirisLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 p-6">
        <div className="h-16 w-16 animate-pulse rounded-full bg-[var(--border)]" />
        <div className="h-6 w-40 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="h-4 w-56 animate-pulse rounded bg-[var(--border)]" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-[var(--border)]" />
      </div>
    </div>
  )
}

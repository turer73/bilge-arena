import Link from 'next/link'

/**
 * /oda altindaki tum sayfalara "Ana Sayfa" navigasyon butonu.
 * /arena (logged-in dashboard, navbar pattern). /oda/[code] kendi
 * "Odalarima Don" butonunu ayrica render eder.
 */
export default function OdaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="mb-3">
        <Link
          href="/arena"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
          aria-label="Ana sayfaya dön"
        >
          <span aria-hidden="true">←</span>
          <span>Ana Sayfa</span>
        </Link>
      </div>
      {children}
    </>
  )
}

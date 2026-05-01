import type { Metadata } from 'next'
import Link from 'next/link'
import { slugToLabel } from '@/lib/rooms/categories'

/**
 * Bilge Arena Oda: /p/[code] public share landing
 * Sprint 2C Task 8 PR3 + Codex P1 fix (T8 PR3 follow-up)
 *
 * Codex review (PR #68 commit 303e199d6e) yakaladi: generateMetadata
 * /oda/[code] auth-gated route'da — sosyal medya crawler oturumsuz hit
 * eder, page redirect /giris yapar. Crawler metadata goremez, OG card
 * preview kirik.
 *
 * Cozum: Public share route /p/[code]:
 *   - Auth YOK (proxy.ts middleware sadece /admin matcher)
 *   - generateMetadata querystring driven (og_title/og_score/og_category)
 *   - Page body: minimal sonuc + "Sen de oyna" CTA -> /oda/[code] redirect
 *   - Sosyal medya crawler bu route'tan OG meta tag'lerini fetch edip
 *     /api/og/result/[code]?title=... ile dynamic kart cizer
 *
 * Plan-deviation #85 (yeni): /p/ kisa public prefix. /share/ alternative
 * olabilirdi ama URL'de scrolling icin kisa tercih. Auth-gated /oda/[code]
 * gercek lobby kalir; /p/[code] sadece SHARED meta + CTA.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const { code } = await params
  const sp = await searchParams

  const ogTitle =
    typeof sp.og_title === 'string' ? sp.og_title : 'Bilge Arena Oda'
  const ogScore = typeof sp.og_score === 'string' ? sp.og_score : undefined
  const ogCategory =
    typeof sp.og_category === 'string' ? sp.og_category : undefined

  const ogParams = new URLSearchParams({ title: ogTitle })
  if (ogScore) ogParams.set('score', ogScore)
  if (ogCategory) ogParams.set('category', ogCategory)

  const description = ogCategory
    ? `${slugToLabel(ogCategory)} kategorisinde Bilge Arena yarışması`
    : 'Bilge Arena oyun odası'

  return {
    title: `${ogTitle} — Bilge Arena`,
    description,
    openGraph: {
      title: ogTitle,
      description,
      images: [
        {
          url: `/api/og/result/${code}?${ogParams.toString()}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [`/api/og/result/${code}?${ogParams.toString()}`],
    },
  }
}

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { code } = await params
  const sp = await searchParams

  const ogTitle =
    typeof sp.og_title === 'string' ? sp.og_title : 'Bilge Arena Oda'
  const ogScore = typeof sp.og_score === 'string' ? sp.og_score : undefined
  const ogCategory =
    typeof sp.og_category === 'string' ? sp.og_category : undefined

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="text-5xl">🏆</div>
      <h1 className="text-2xl font-bold">{ogTitle}</h1>
      {ogScore && (
        <p className="text-base">
          <span className="text-[var(--text-sub)]">Skor:</span>{' '}
          <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {ogScore}
          </span>
        </p>
      )}
      {ogCategory && (
        <p className="text-sm text-[var(--text-sub)]">
          Kategori: {slugToLabel(ogCategory)}
        </p>
      )}
      <p className="text-sm text-[var(--text-sub)]">
        Bu bir Bilge Arena oyun sonucu. Sen de katılmak ister misin?
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={`/oda/${code}`}
          className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
        >
          🎮 Bu Odaya Katıl
        </Link>
        <Link
          href="/oda"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-medium hover:bg-[var(--card)]"
        >
          Yeni Oda Kur
        </Link>
      </div>
      <p className="mt-4 text-xs text-[var(--text-sub)]">bilgearena.com</p>
    </main>
  )
}

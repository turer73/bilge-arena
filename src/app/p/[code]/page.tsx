import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { slugToLabel } from '@/lib/rooms/categories'
import { isShareRoomCode, verifyShareParams, type ShareClaims } from '@/lib/rooms/share-link'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

/**
 * Bilge Arena Oda: /p/[code] public share landing
 *
 * Auth YOK: sosyal medya tarayicisi oturumsuz gelir, OG meta etiketlerini
 * buradan okur (/oda/[code] auth-gated oldugu icin tarayici /giris'e gider).
 *
 * Guvenlik (genel tarama 2026-10-26, disc #2950): baslik, skor ve kategori
 * eskiden dogrudan URL'den basiliyordu; var olmayan kod ve uydurma metinle
 * bilgearena.com alanindan sahte sonuc karti uretilebiliyordu. Artik degerler
 * yalniz sunucunun imzaladigi baglantidan gelir (POST /api/rooms/[id]/share-link).
 * Imzasi tutmayan istekte URL'deki metin HIC kullanilmaz; genel kart gosterilir.
 */

const GENERIC_TITLE = 'Bilge Arena oyun sonucu'

type ShareRouteProps = {
  params: Promise<{ code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type ResolvedShare = { code: string; claims: ShareClaims | null; signature: string | null }

async function resolveShare({ params, searchParams }: ShareRouteProps): Promise<ResolvedShare> {
  const { code } = await params
  if (!isShareRoomCode(code)) notFound()
  const query = await searchParams
  const claims = await verifyShareParams(code, query)
  // İmza yalnız doğrulandıysa taşınır; istek kapsamında kalır.
  const signature = claims && typeof query.og_sig === 'string' ? query.og_sig : null
  return { code, claims, signature }
}

function ogImagePath({ code, claims, signature }: ResolvedShare): string {
  const base = `/api/og/result/${encodeURIComponent(code)}`
  if (!claims || !signature) return base
  // Imzali degerler OG route'a aynen iletilir; route imzayi yeniden dogrular.
  const query = new URLSearchParams({ og_title: claims.title })
  if (claims.score !== null) query.set('og_score', String(claims.score))
  if (claims.category !== null) query.set('og_category', claims.category)
  query.set('og_sig', signature)
  return `${base}?${query.toString()}`
}

export async function generateMetadata(props: ShareRouteProps): Promise<Metadata> {
  const share = await resolveShare(props)
  const { claims } = share

  const title = claims?.title ?? GENERIC_TITLE
  const description = claims?.category
    ? `${slugToLabel(claims.category)} kategorisinde Bilge Arena yarışması`
    : 'Bilge Arena oyun odası'
  const image = ogImagePath(share)

  return {
    // Kok layout '%s | Bilge Arena' sablonu markayi ekler.
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      ...OG_DEFAULTS,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function SharePage(props: ShareRouteProps) {
  const { code, claims } = await resolveShare(props)

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="text-5xl">🏆</div>
      <h1 className="text-2xl font-bold">{claims?.title ?? GENERIC_TITLE}</h1>
      {claims?.score != null && (
        <p className="text-base">
          <span className="text-[var(--text-sub)]">Skor:</span>{' '}
          <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {claims.score}
          </span>
        </p>
      )}
      {claims?.category && (
        <p className="text-sm text-[var(--text-sub)]">
          Kategori: {slugToLabel(claims.category)}
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

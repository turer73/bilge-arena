import type { Metadata } from 'next'
import Link from 'next/link'
import { COZUMLU_SORU_LIST } from '@/lib/content/cozumlu-soru'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Çözümlü Sorular — TYT · AYT · LGS Adım Adım Çözümler',
  description:
    'YKS ve LGS için çözümlü sorular: adım adım çözüm, sık yapılan hata ve konu ipuçlarıyla.',
  keywords: ['çözümlü soru', 'tyt çözümlü soru', 'lgs çözümlü soru', 'ayt çözümlü soru'],
  alternates: { canonical: `${siteUrl}/cozumlu-soru` },
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Çözümlü Sorular | Bilge Arena',
    description: 'Adım adım çözümlü TYT · AYT · LGS soruları.',
    url: `${siteUrl}/cozumlu-soru`,
  },
}

const blogJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Bilge Arena Çözümlü Sorular',
  url: `${siteUrl}/cozumlu-soru`,
  inLanguage: 'tr',
  blogPost: COZUMLU_SORU_LIST.map((s) => ({
    '@type': 'BlogPosting',
    headline: s.title,
    description: s.description,
    url: `${siteUrl}/cozumlu-soru/${s.slug}`,
    dateModified: s.updated,
  })),
}

export default function CozumluSoruPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />

      <section className="mb-12 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Çözümlü Sorular</h1>
        <p className="mx-auto max-w-[560px] text-base text-[var(--text-sub)]">
          TYT, AYT ve LGS soru tiplerinden adım adım çözümlü örnekler — sık yapılan hatalar ve
          konu ipuçlarıyla.
        </p>
      </section>

      <section className="space-y-4">
        {COZUMLU_SORU_LIST.map((s) => (
          <Link
            key={s.slug}
            href={`/cozumlu-soru/${s.slug}`}
            className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--focus)]/40"
          >
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[var(--focus)]">
              <span className="rounded-md bg-[var(--focus-bg)] px-2 py-0.5">{s.ders}</span>
              <span className="text-[var(--text-muted)]">{s.readingMinutes} dk okuma</span>
            </div>
            <h2 className="mb-1.5 text-lg font-bold group-hover:underline">{s.title}</h2>
            <p className="text-sm leading-relaxed text-[var(--text-sub)]">{s.description}</p>
          </Link>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-6 text-center">
        <h2 className="mb-2 text-lg font-bold">Daha fazla soru çözmek ister misin?</h2>
        <p className="mb-4 text-sm text-[var(--text-sub)]">
          Bilge Arena&#39;da bu tipte onlarca soruyu oyunlaştırılmış modda çözerek puan kazan.
        </p>
        <Link href="/arena" className="text-sm font-semibold text-[var(--focus)] hover:underline">
          Oynamaya başla →
        </Link>
      </section>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { COZUMLU_SORU_LIST, COZUMLU_SORU_SLUGS, getCozumluSoru } from '@/lib/content/cozumlu-soru'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const dynamicParams = false

export function generateStaticParams() {
  return COZUMLU_SORU_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const s = getCozumluSoru(slug)
  if (!s) return {}
  const ogImage = `${siteUrl}/og?title=${encodeURIComponent(s.title)}&subtitle=${encodeURIComponent(s.description.slice(0, 80))}`
  return {
    title: `${s.title} | Bilge Arena`,
    description: s.description,
    alternates: { canonical: `${siteUrl}/cozumlu-soru/${slug}` },
    openGraph: {
      ...OG_DEFAULTS,
      type: 'article',
      title: s.title,
      description: s.description,
      url: `${siteUrl}/cozumlu-soru/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: s.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: s.title,
      description: s.description,
      images: [ogImage],
    },
  }
}

export default async function CozumluSoruDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const s = getCozumluSoru(slug)
  if (!s) notFound()

  const others = COZUMLU_SORU_LIST.filter((x) => x.slug !== slug)

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Question',
      name: s.title,
      text: s.question,
      inLanguage: 'tr',
      dateCreated: s.updated,
      answerCount: 1,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${s.correctAnswer}. ${s.steps.join(' ')}`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Çözümlü Sorular', item: `${siteUrl}/cozumlu-soru` },
        { '@type': 'ListItem', position: 3, name: s.title, item: `${siteUrl}/cozumlu-soru/${slug}` },
      ],
    },
  ]

  return (
    <article className="mx-auto max-w-[760px] px-6 py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="mb-6 text-xs text-[var(--text-muted)]">
        <Link href="/cozumlu-soru" className="hover:underline">
          Çözümlü Sorular
        </Link>{' '}
        / <span className="text-[var(--text-sub)]">{s.ders}</span>
      </nav>

      {/* Baslik */}
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold text-[var(--focus)]">
          <span className="rounded-md bg-[var(--focus-bg)] px-2 py-0.5">{s.ders}</span>
          <span className="text-[var(--text-muted)]">{s.readingMinutes} dk okuma</span>
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{s.title}</h1>
      </header>

      {/* Soru */}
      <section className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-3 text-sm font-bold text-[var(--text-muted)]">Soru</h2>
        <p className="mb-4 text-[15px] leading-relaxed">{s.question}</p>
        <div className="space-y-1.5">
          {s.options.map((o) => (
            <div key={o} className="text-sm text-[var(--text-sub)]">
              {o}
            </div>
          ))}
        </div>
      </section>

      {/* Cozum */}
      <section className="mb-8">
        <h2 className="mb-4 text-xl font-bold">Çözüm (Adım Adım)</h2>
        <ol className="space-y-3">
          {s.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-[var(--text-sub)]">
              <span className="shrink-0 font-bold text-[var(--focus)]">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Dogru cevap */}
      <section className="mb-8 rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-5">
        <h2 className="mb-1 text-sm font-bold text-[var(--text-muted)]">Doğru Cevap</h2>
        <p className="text-lg font-bold text-[var(--focus)]">{s.correctAnswer}</p>
      </section>

      {/* Sik yapilan hata */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-bold">Sık Yapılan Hata</h2>
        <p className="text-[15px] leading-relaxed text-[var(--text-sub)]">{s.commonMistake}</p>
      </section>

      {/* Konu ipucu */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">Konu İpucu</h2>
        <p className="text-[15px] leading-relaxed text-[var(--text-sub)]">
          {s.tip}
          {s.tipLinkHref && s.tipLinkLabel && (
            <>
              {' '}
              <Link href={s.tipLinkHref} className="font-semibold text-[var(--focus)] hover:underline">
                {s.tipLinkLabel}
              </Link>
              {' '}konusuna göz at.
            </>
          )}
        </p>
      </section>

      {/* CTA */}
      <div className="mb-10 rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-6 text-center">
        <h2 className="mb-3 text-lg font-bold">Benzer soruları çöz</h2>
        <p className="mb-4 text-sm text-[var(--text-sub)]">
          Bu tipte onlarca soruyu ücretsiz, oyunlaştırılmış modda çözerek puan kazan.
        </p>
        <Link href="/arena">
          <Button variant="primary" size="md">
            Oynamaya Başla
          </Button>
        </Link>
      </div>

      {/* Diger sorular */}
      {others.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-bold text-[var(--text-muted)]">Diğer Çözümlü Sorular</h2>
          <div className="space-y-3">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/cozumlu-soru/${o.slug}`}
                className="block rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--focus)]/40"
              >
                <div className="text-sm font-bold">{o.title}</div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">{o.description}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

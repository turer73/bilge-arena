import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { REHBER_ARTICLES, REHBER_SLUGS, getArticle } from '@/lib/content/rehber'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const dynamicParams = false

export function generateStaticParams() {
  return REHBER_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const a = getArticle(slug)
  if (!a) return {}
  return {
    title: `${a.title} | Bilge Arena Rehber`,
    description: a.description,
    alternates: { canonical: `${siteUrl}/rehber/${slug}` },
    openGraph: {
      ...OG_DEFAULTS,
      type: 'article',
      title: a.title,
      description: a.description,
      url: `${siteUrl}/rehber/${slug}`,
    },
  }
}

export default async function RehberArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const a = getArticle(slug)
  if (!a) notFound()

  const others = REHBER_ARTICLES.filter((x) => x.slug !== slug)

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    inLanguage: 'tr',
    dateModified: a.updated,
    author: { '@type': 'Organization', name: 'Bilge Arena' },
    publisher: { '@type': 'Organization', name: 'Bilge Arena', url: siteUrl },
    mainEntityOfPage: `${siteUrl}/rehber/${slug}`,
  }

  return (
    <article className="mx-auto max-w-[760px] px-6 py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="mb-6 text-xs text-[var(--text-muted)]">
        <Link href="/rehber" className="hover:underline">
          Rehber
        </Link>{' '}
        / <span className="text-[var(--text-sub)]">{a.category}</span>
      </nav>

      {/* Baslik */}
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold text-[var(--focus)]">
          <span className="rounded-md bg-[var(--focus-bg)] px-2 py-0.5">{a.category}</span>
          <span className="text-[var(--text-muted)]">{a.readingMinutes} dk okuma</span>
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{a.title}</h1>
        <p className="mt-3 text-base text-[var(--text-sub)]">{a.description}</p>
      </header>

      {/* Govde */}
      <div className="space-y-4">
        {a.body.map((p, i) =>
          p.startsWith('## ') ? (
            <h2 key={i} className="pt-2 text-xl font-bold">
              {p.slice(3)}
            </h2>
          ) : (
            <p key={i} className="text-[15px] leading-relaxed text-[var(--text-sub)]">
              {p}
            </p>
          )
        )}
      </div>

      {/* CTA */}
      <div className="mt-10 rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-6 text-center">
        <h2 className="mb-3 text-lg font-bold">Bilgini sına</h2>
        <p className="mb-4 text-sm text-[var(--text-sub)]">
          Okuduklarını ücretsiz, oyunlaştırılmış sorularla pekiştir.
        </p>
        <Link href="/arena">
          <Button variant="primary" size="md">
            Oynamaya Başla
          </Button>
        </Link>
      </div>

      {/* Diger yazilar */}
      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-bold text-[var(--text-muted)]">Diğer Yazılar</h2>
          <div className="space-y-3">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/rehber/${o.slug}`}
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

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
  const ogImage = `${siteUrl}/og?title=${encodeURIComponent(a.title)}&subtitle=${encodeURIComponent(a.description.slice(0, 80))}`
  return {
    title: { absolute: `${a.title} | Bilge Arena Rehber` },
    description: a.description,
    alternates: { canonical: `${siteUrl}/rehber/${slug}` },
    openGraph: {
      ...OG_DEFAULTS,
      type: 'article',
      title: a.title,
      description: a.description,
      url: `${siteUrl}/rehber/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: a.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: a.title,
      description: a.description,
      images: [ogImage],
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

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: a.title,
      description: a.description,
      inLanguage: 'tr',
      datePublished: a.updated,
      dateModified: a.updated,
      author: {
        '@type': 'Organization',
        name: 'Bilge Arena İçerik Ekibi',
        url: `${siteUrl}/hakkinda#icerik-sorumlulugu`,
      },
      publisher: { '@type': 'Organization', name: 'Bilge Arena', url: siteUrl },
      mainEntityOfPage: `${siteUrl}/rehber/${slug}`,
      citation: a.sources?.map((source) => source.url),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Sınav Rehberi', item: `${siteUrl}/rehber` },
        { '@type': 'ListItem', position: 3, name: a.title, item: `${siteUrl}/rehber/${slug}` },
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
          <span className="text-[var(--text-muted)]">
            Güncellendi: {new Intl.DateTimeFormat('tr-TR').format(new Date(`${a.updated}T00:00:00Z`))}
          </span>
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{a.title}</h1>
        <p className="mt-3 text-base text-[var(--text-sub)]">{a.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
          <span>Hazırlayan</span>
          <Link
            href="/hakkinda#icerik-sorumlulugu"
            className="font-semibold text-[var(--text-sub)] hover:text-[var(--focus)] hover:underline"
          >
            Bilge Arena İçerik Ekibi
          </Link>
          {a.sources && a.sources.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>Birincil kaynaklarla doğrulandı</span>
            </>
          )}
        </div>
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

      {a.sources && a.sources.length > 0 && (
        <aside className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-base font-bold">Kaynaklar ve güncellik</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-sub)]">
            Sınav yapısı ve tarihler için birincil kaynaklar kullanılmıştır. Kurallar değişebileceği
            için başvuru yapacağın yılın güncel ÖSYM kılavuzunu ayrıca kontrol et.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {a.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[var(--focus)] hover:underline"
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}

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

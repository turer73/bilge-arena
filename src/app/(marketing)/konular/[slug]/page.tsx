import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  GAMES,
  GAME_LIST,
  GAME_SLUGS,
  getCategoryLabel,
  type GameSlug,
} from '@/lib/constants/games'
import { SUBJECT_EMOJI, SUBJECT_CONTENT } from '@/lib/content/konular'
import { SAMPLE_QUESTIONS } from '@/lib/content/ornek-sorular'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

// Yalniz bilinen 5 ders SSG; bilinmeyen slug 404.
export const dynamicParams = false

export function generateStaticParams() {
  return GAME_SLUGS.map((slug) => ({ slug }))
}

function isGameSlug(slug: string): slug is GameSlug {
  return (GAME_SLUGS as string[]).includes(slug)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if (!isGameSlug(slug)) return {}
  const g = GAMES[slug]
  const c = SUBJECT_CONTENT[slug]
  const title = `${g.name} Konuları — ${g.examTags.join(' · ')} | Bilge Arena`
  const ogImage = `${siteUrl}/og?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(c.tagline.slice(0, 80))}`
  return {
    title: `${g.name} — ${c.tagline}`,
    description: c.intro.slice(0, 155),
    keywords: c.keywords,
    alternates: { canonical: `${siteUrl}/konular/${slug}` },
    openGraph: {
      ...OG_DEFAULTS,
      title,
      description: c.tagline,
      url: `${siteUrl}/konular/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: c.tagline,
      images: [ogImage],
    },
  }
}

export default async function KonuPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!isGameSlug(slug)) notFound()

  const g = GAMES[slug]
  const c = SUBJECT_CONTENT[slug]
  const others = GAME_LIST.filter((x) => x.slug !== slug)
  const samples = SAMPLE_QUESTIONS[slug] ?? []

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${g.name} — YKS · LGS Hazırlık`,
      description: c.intro,
      url: `${siteUrl}/konular/${slug}`,
      provider: { '@type': 'Organization', name: 'Bilge Arena', url: siteUrl },
      inLanguage: 'tr',
      isAccessibleForFree: true,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Konular', item: `${siteUrl}/konular` },
        { '@type': 'ListItem', position: 3, name: g.name, item: `${siteUrl}/konular/${slug}` },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-[900px] px-6 py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="mb-6 text-xs text-[var(--text-muted)]">
        <Link href="/konular" className="hover:underline">
          Konular
        </Link>{' '}
        / <span className="text-[var(--text-sub)]">{g.name}</span>
      </nav>

      {/* Hero */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-4">
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-3xl"
            style={{ backgroundColor: `${g.colorHex}1A` }}
          >
            {SUBJECT_EMOJI[slug]}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: g.colorHex }}>
              {g.name}
            </h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.examTags.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-sub)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-base leading-relaxed text-[var(--text-sub)]">{c.intro}</p>
      </section>

      {/* Kategoriler */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold">Konu Başlıkları</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {g.categories.map((cat) => (
            <div
              key={cat}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium"
            >
              {getCategoryLabel(cat)}
            </div>
          ))}
        </div>
      </section>

      {/* Calisma onerisi */}
      <section className="mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-2 text-lg font-bold">Nasıl Çalışmalı?</h2>
        <p className="text-sm leading-relaxed text-[var(--text-sub)]">{c.studyTip}</p>
      </section>

      {/* Ornek Sorular */}
      {samples.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-xl font-bold">Örnek Sorular</h2>
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            {g.name} dersinden örnek sorular ve çözümleri — ücretsiz, kayıt gerektirmez.
          </p>
          <div className="space-y-4">
            {samples.map((sq, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <p className="mb-3 font-semibold">
                  {i + 1}. {sq.q}
                </p>
                <ul className="space-y-1.5">
                  {sq.options.map((opt, oi) => (
                    <li
                      key={oi}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                        oi === sq.correct
                          ? 'border border-[var(--focus)]/40 bg-[var(--focus-bg)] font-semibold text-[var(--focus)]'
                          : 'text-[var(--text-sub)]'
                      }`}
                    >
                      <span className="font-bold">{String.fromCharCode(65 + oi)})</span>
                      <span>{opt}</span>
                      {oi === sq.correct && (
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-wide">
                          Doğru
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                  <span className="font-bold">Açıklama:</span> {sq.explanation}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mb-12 text-center">
        <h2 className="mb-3 text-xl font-bold">{g.name} sorularını çözmeye başla</h2>
        <p className="mb-5 text-sm text-[var(--text-sub)]">
          Ücretsiz, oyunlaştırılmış ve her cihazda. Hemen arenaya gir.
        </p>
        <Link href="/arena">
          <Button variant="primary" size="lg">
            Oynamaya Başla
          </Button>
        </Link>
      </section>

      {/* Diger dersler */}
      <section>
        <h2 className="mb-4 text-sm font-bold text-[var(--text-muted)]">Diğer Dersler</h2>
        <div className="flex flex-wrap gap-2">
          {others.map((o) => (
            <Link
              key={o.slug}
              href={`/konular/${o.slug}`}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium transition-colors hover:border-[var(--focus)]/40"
            >
              <span>{SUBJECT_EMOJI[o.slug]}</span>
              {o.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

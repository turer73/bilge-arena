import type { Metadata } from 'next'
import Link from 'next/link'
import { REHBER_ARTICLES } from '@/lib/content/rehber'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Sınav Rehberi — YKS · LGS Çalışma Yöntemleri ve İpuçları',
  description:
    'YKS ve LGS hazırlığı, öğrenme bilimi, adaptif öğrenme, soru kalitesi ve verimli çalışma yöntemleri üzerine ücretsiz rehber.',
  keywords: ['yks rehberi', 'lgs rehberi', 'öğrenme bilimi', 'adaptif öğrenme', 'soru kalitesi', 'verimli çalışma', 'tyt ayt farkı'],
  alternates: { canonical: `${siteUrl}/rehber` },
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Sınav Rehberi | Bilge Arena',
    description: 'YKS · LGS çalışma yöntemleri, öğrenme bilimi ve adaptif öğrenme rehberi.',
    url: `${siteUrl}/rehber`,
  },
}

const blogJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Bilge Arena Sınav Rehberi',
  url: `${siteUrl}/rehber`,
  inLanguage: 'tr',
  blogPost: REHBER_ARTICLES.map((a) => ({
    '@type': 'BlogPosting',
    headline: a.title,
    description: a.description,
    url: `${siteUrl}/rehber/${a.slug}`,
    dateModified: a.updated,
  })),
}

export default function RehberPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />

      <section className="mb-12 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Sınav Rehberi</h1>
        <p className="mx-auto max-w-[560px] text-base text-[var(--text-sub)]">
          YKS ve LGS hazırlığı için sınav sistemi, öğrenme bilimi, soru kalitesi,
          çalışma yöntemleri ve pratik ipuçları.
        </p>
      </section>

      <section className="space-y-4">
        {REHBER_ARTICLES.map((a) => (
          <Link
            key={a.slug}
            href={`/rehber/${a.slug}`}
            className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--focus)]/40"
          >
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[var(--focus)]">
              <span className="rounded-md bg-[var(--focus-bg)] px-2 py-0.5">{a.category}</span>
              <span className="text-[var(--text-muted)]">{a.readingMinutes} dk okuma</span>
            </div>
            <h2 className="mb-1.5 text-lg font-bold group-hover:underline">{a.title}</h2>
            <p className="text-sm leading-relaxed text-[var(--text-sub)]">{a.description}</p>
          </Link>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-6 text-center">
        <h2 className="mb-2 text-lg font-bold">Konuları mı arıyorsun?</h2>
        <p className="mb-4 text-sm text-[var(--text-sub)]">
          Beş dersin konu başlıklarını incele ve ücretsiz soru çözmeye başla.
        </p>
        <Link href="/konular" className="text-sm font-semibold text-[var(--focus)] hover:underline">
          Konulara göz at →
        </Link>
      </section>
    </div>
  )
}

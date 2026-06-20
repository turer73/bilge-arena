import type { Metadata } from 'next'
import Link from 'next/link'
import { GAME_LIST } from '@/lib/constants/games'
import { SUBJECT_EMOJI, SUBJECT_CONTENT } from '@/lib/content/konular'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Konular — YKS · LGS · AYT Dersleri ve Konu Başlıkları',
  description:
    'Bilge Arena ders konuları: Matematik, Türkçe, Fen, Sosyal ve İngilizce. Her ders için TYT · AYT · LGS konu başlıkları, kategoriler ve ücretsiz soru çözme.',
  keywords: ['yks konuları', 'tyt konuları', 'ayt konuları', 'lgs konuları', 'ders konu başlıkları'],
  alternates: { canonical: `${siteUrl}/konular` },
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Konular | Bilge Arena',
    description: 'YKS, LGS ve AYT için ders konu başlıkları ve ücretsiz soru pratiği.',
    url: `${siteUrl}/konular`,
  },
}

const itemListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Bilge Arena Dersleri',
  itemListElement: GAME_LIST.map((g, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: g.name,
    url: `${siteUrl}/konular/${g.slug}`,
  })),
}

export default function KonularPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/* Hero */}
      <section className="mb-12 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Konular</h1>
        <p className="mx-auto max-w-[560px] text-base text-[var(--text-sub)]">
          YKS, LGS ve AYT için beş derste konu başlıkları, kategoriler ve ücretsiz soru
          çözme. Bir ders seç, kapsamı incele, hemen pratiğe başla.
        </p>
      </section>

      {/* Ders kartlari */}
      <section className="grid gap-4 sm:grid-cols-2">
        {GAME_LIST.map((g) => (
          <Link
            key={g.slug}
            href={`/konular/${g.slug}`}
            className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--focus)]/40"
          >
            <div className="mb-3 flex items-center gap-3">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ backgroundColor: `${g.colorHex}1A` }}
              >
                {SUBJECT_EMOJI[g.slug]}
              </div>
              <div>
                <h2 className="text-lg font-bold">{g.name}</h2>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {g.examTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-sub)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-[var(--text-sub)]">
              {SUBJECT_CONTENT[g.slug].tagline}
            </p>
            <span className="mt-auto text-sm font-semibold text-[var(--focus)] group-hover:underline">
              Konuyu incele →
            </span>
          </Link>
        ))}
      </section>

      {/* Rehber capraz-link */}
      <section className="mt-10 rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-6 text-center">
        <h2 className="mb-2 text-lg font-bold">Sınav Rehberi</h2>
        <p className="mb-4 text-sm text-[var(--text-sub)]">
          YKS · LGS çalışma yöntemleri ve sınav sistemi hakkında ücretsiz rehber yazıları.
        </p>
        <Link href="/rehber" className="text-sm font-semibold text-[var(--focus)] hover:underline">
          Rehberi keşfet →
        </Link>
      </section>
    </div>
  )
}

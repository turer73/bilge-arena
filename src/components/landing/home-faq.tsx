import Link from 'next/link'
import { faqPageJsonLd, HOME_FAQ } from '@/lib/content/site-faq'
import { serializeJsonLd } from '@/lib/seo/serialize-json-ld'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

/**
 * Ana sayfa SSS: ücret ve güven sorularını ilk ekranda yanıtlar. Yapay zekâ
 * özellikli aramalarda "güvenilir mi", "ücreti var mı" soruları ana sayfaya
 * yönleniyordu (Search Console, 2026-10); yanıtlar site-faq.ts'te.
 */
export function HomeFaq() {
  return (
    <section className="w-full py-14" aria-labelledby="home-faq-title">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            ...faqPageJsonLd(HOME_FAQ, `${siteUrl}/#faq`),
          }),
        }}
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Merak edilenler</p>
          <h2 id="home-faq-title" className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Sık sorulan sorular</h2>
        </div>
        <Link href="/nasil-calisir#sss-baslik" className="text-sm font-semibold text-[var(--focus-text)] hover:underline">
          Tüm sorular
        </Link>
      </div>
      <div className="space-y-3">
        {HOME_FAQ.map((item) => (
          <details key={item.q} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <summary className="cursor-pointer font-bold text-[var(--text)]">{item.q}</summary>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

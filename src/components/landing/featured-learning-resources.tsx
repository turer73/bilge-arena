import Link from 'next/link'
import { FEATURED_LEARNING_RESOURCES } from '@/lib/content/featured-learning-resources'

export function FeaturedLearningResources() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-6 py-14 lg:px-8" aria-labelledby="featured-learning-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Ücretsiz öğrenme kaynakları</p>
          <h2 id="featured-learning-title" className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Okuyarak da ilerle</h2>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/rehber" className="text-[var(--focus-text)] hover:underline">Tüm rehberler</Link>
          <Link href="/cozumlu-soru" className="text-[var(--focus-text)] hover:underline">Tüm çözümler</Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURED_LEARNING_RESOURCES.map((resource) => (
          <article key={resource.href} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{resource.kind}</p>
            <h3 className="mb-2 text-lg font-bold leading-snug text-[var(--text)]">
              <Link href={resource.href} className="hover:underline">{resource.title}</Link>
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">{resource.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

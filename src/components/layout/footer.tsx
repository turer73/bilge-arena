import Link from 'next/link'
import { Logo } from './logo'

const FOOTER_LINKS = [
  {
    title: 'Platform',
    links: [
      { label: 'Oyunlar', href: '/arena' },
      { label: 'Sıralama', href: '/arena/siralama' },
      { label: 'Profil', href: '/arena/profil' },
      { label: 'Nasıl Çalışır', href: '/nasil-calisir' },
    ],
  },
  {
    title: 'Dersler',
    links: [
      { label: 'Matematik', href: '/arena/matematik' },
      { label: 'Türkçe', href: '/arena/turkce' },
      { label: 'Fen', href: '/arena/fen' },
      { label: 'Sosyal', href: '/arena/sosyal' },
      { label: 'İngilizce', href: '/arena/wordquest' },
    ],
  },
  {
    title: 'Destek',
    links: [
      { label: 'Hakkında', href: '/hakkinda' },
      { label: 'Nasıl Çalışır', href: '/nasil-calisir' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-[1200px] px-6 pb-8 pt-16 lg:px-8">
        {/* Grid */}
        <div className="mb-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Logo size={36} />
            <p className="mt-4 max-w-[280px] text-sm leading-relaxed text-[var(--text-muted)]">
              YKS&#39;ye hazırlanan öğrenciler için oyun tabanlı ücretsiz alıştırma platformu.
            </p>
          </div>

          {/* Link groups */}
          {FOOTER_LINKS.map(({ title, links }) => (
            <div key={title}>
              <div className="mb-4 text-sm font-bold tracking-wide text-[var(--text)]">
                {title}
              </div>
              {links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="mb-2.5 block text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] pt-6 sm:flex-row">
          <div className="text-sm text-[var(--text-muted)]">
            &copy; 2026 Bilge Arena. Tüm hakları saklıdır.
          </div>
          <div className="flex gap-2">
            {['Twitter', 'Instagram', 'Discord'].map((s) => (
              <button
                key={s}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

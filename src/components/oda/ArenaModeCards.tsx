import Link from 'next/link'
import { ArrowRight, Castle, Swords } from 'lucide-react'

const MODES = [
  {
    href: '/arena/kule',
    title: 'Kule Modu',
    description: 'Yanlış yapmadan yüksel; her katta tempo artar.',
    badge: 'Tek oyuncu',
    Icon: Castle,
    tint: 'var(--focus-bg)',
    color: 'var(--focus-text)',
  },
  {
    href: '/arena/fethet',
    title: 'Bil ve Fethet',
    description: 'Soruları çöz, bölgeleri ele geçir ve haritayı tamamla.',
    badge: 'Strateji',
    Icon: Swords,
    tint: 'var(--reward-bg)',
    color: 'var(--reward-text)',
  },
] as const

/** Arena sekmesindeki tek oyunculu, kalıcı oyun modları. */
export function ArenaModeCards() {
  return (
    <section aria-labelledby="solo-arena-title" className="mb-8">
      <div className="mb-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">TEK BAŞINA OYNA</p>
        <h2 id="solo-arena-title" className="mt-1 text-lg font-extrabold">Arena modları</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map(({ href, title, description, badge, Icon, tint, color }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-[116px] items-center gap-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_4px_0_var(--border)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: tint, color }}>
              <Icon aria-hidden="true" size={24} strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color }}>{badge}</span>
              <span className="mt-0.5 block text-sm font-extrabold text-[var(--text)]">{title}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--text-sub)]">{description}</span>
            </span>
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  )
}

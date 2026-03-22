'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/layout/logo'

const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/sorular', label: 'Sorular', icon: '📝' },
  { href: '/admin/kullanicilar', label: 'Kullanicilar', icon: '👥' },
  { href: '/admin/raporlar', label: 'Raporlar', icon: '🐛' },
  { href: '/admin/loglar', label: 'Loglar', icon: '📜' },
  { href: '/admin/ayarlar', label: 'Ayarlar', icon: '⚙️' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        {/* Logo */}
        <div className="flex h-[72px] items-center gap-2 border-b border-[var(--border)] px-5">
          <Logo size={28} />
          <span className="rounded-md bg-[var(--urgency)] px-1.5 py-0.5 text-[9px] font-bold text-white">
            ADMIN
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {ADMIN_NAV.map(({ href, label, icon }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--focus-bg)] text-[var(--focus)] font-bold'
                    : 'text-[var(--text-sub)] hover:bg-[var(--card)] hover:text-[var(--text)]'
                }`}
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Alt: siteye don */}
        <div className="border-t border-[var(--border)] px-3 py-3">
          <Link
            href="/arena"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
          >
            ← Siteye Don
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-[220px] flex-1 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}

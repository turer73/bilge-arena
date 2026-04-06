'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/layout/logo'

interface NavItem {
  href: string
  label: string
  icon: string
  permission: string
}

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: '📊', permission: 'admin.dashboard.view' },
  { href: '/admin/anasayfa-editor', label: 'Anasayfa', icon: '🏠', permission: 'admin.homepage.view' },
  { href: '/admin/sorular', label: 'Sorular', icon: '📝', permission: 'admin.questions.view' },
  { href: '/admin/kullanicilar', label: 'Kullanıcılar', icon: '👥', permission: 'admin.users.view' },
  { href: '/admin/raporlar', label: 'Raporlar', icon: '🐛', permission: 'admin.reports.view' },
  { href: '/admin/loglar', label: 'Loglar', icon: '📜', permission: 'admin.logs.view' },
  { href: '/admin/ayarlar', label: 'Ayarlar', icon: '⚙️', permission: 'admin.settings.view' },
  { href: '/admin/roller', label: 'Roller', icon: '🔐', permission: 'admin.roles.view' },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const [permissions, setPermissions] = useState<string[] | null>(null) // null = henüz yüklenmedi
  const [roleName, setRoleName] = useState<string>('')

  useEffect(() => {
    fetch('/api/admin/me/permissions')
      .then(r => {
        if (!r.ok) throw new Error('permissions fetch failed')
        return r.json()
      })
      .then(data => {
        if (data.permissions && Array.isArray(data.permissions) && data.permissions.length > 0) {
          setPermissions(data.permissions)
        } else {
          // İzin yoksa veya boş döndüyse → tüm menüleri göster (eski davranış)
          setPermissions(null)
        }
        setRoleName(data.roles?.[0]?.name || '')
      })
      .catch(() => {
        // RBAC tabloları yoksa veya hata olduysa → tüm menüleri göster (geriye uyumlu)
        setPermissions(null)
      })
  }, [])

  // permissions null ise → RBAC henüz aktif değil, tüm menüleri göster
  // permissions dolu ise → izne göre filtrele
  const visibleNav = permissions
    ? ADMIN_NAV.filter(item => permissions.includes(item.permission))
    : ADMIN_NAV

  return (
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
        {visibleNav.map(({ href, label, icon }) => {
          const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href))
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

      {/* Alt: rol bilgisi + siteye dön */}
      <div className="border-t border-[var(--border)] px-3 py-3">
        {roleName && (
          <div className="mb-2 px-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-sub)]">
            {roleName}
          </div>
        )}
        <Link
          href="/arena"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
        >
          ← Siteye Dön
        </Link>
      </div>
    </aside>
  )
}

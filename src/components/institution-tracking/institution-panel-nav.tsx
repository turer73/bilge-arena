'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, LayoutDashboard, UserRoundCog } from 'lucide-react'

const overviewLink = { href: '/arena/kurum', label: 'Genel Bakış', icon: LayoutDashboard }
const rolesLink = { href: '/arena/kurum/roller', label: 'Roller ve Destek', icon: UserRoundCog }

export function InstitutionPanelNav({ canManageRoles }: { canManageRoles: boolean }) {
  const pathname = usePathname()
  const links = canManageRoles ? [overviewLink, rolesLink] : [overviewLink]

  return (
    <nav
      aria-label="Kurum paneli"
      className="rounded-2xl border border-sky-400/20 bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-3 shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/arena/kurum" className="flex min-w-0 items-center gap-2 px-2 text-sm font-black text-sky-200">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-400/10">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate">Kurum Paneli</span>
        </Link>
        <div className="flex gap-2 overflow-x-auto" role="list">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-black transition-colors ${active
                  ? 'border-sky-400/35 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 text-[var(--text-sub)] hover:bg-white/5 hover:text-[var(--text)]'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

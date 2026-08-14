'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Building2,
  Castle,
  GraduationCap,
  PenLine,
  ShoppingBag,
  Swords,
  type LucideIcon,
} from 'lucide-react'

interface ExploreItem {
  href: string
  title: string
  description: string
  badge: string
  icon: LucideIcon
  color: string
}

const EXPLORE_ITEMS: ExploreItem[] = [
  {
    href: '/arena/fethet',
    title: 'Bil ve Fethet',
    description: 'Haritayı bilginle ele geçir',
    badge: 'YENİ',
    icon: Swords,
    color: 'var(--reward)',
  },
  {
    href: '/arena/kule',
    title: 'Kule Modu',
    description: 'Serini bozmadan yüksel',
    badge: 'YENİ',
    icon: Castle,
    color: 'var(--focus)',
  },
  {
    href: '/arena/soru-gonder',
    title: 'Soru Gönder',
    description: 'Topluluğa katkı yap',
    badge: 'KATKI',
    icon: PenLine,
    color: 'var(--growth)',
  },
  {
    href: '/arena/magaza',
    title: 'Mağaza',
    description: 'Görünümünü kişiselleştir',
    badge: 'YENİ',
    icon: ShoppingBag,
    color: 'var(--reward)',
  },
]

const CLASSROOM_ITEM: ExploreItem = {
  href: '/arena/sinif',
  title: 'Sınıflarım',
  description: 'Ödev ve sınıf alanın',
  badge: 'PİLOT',
  icon: GraduationCap,
  color: 'var(--growth)',
}

const INSTITUTION_ITEM: ExploreItem = {
  href: '/arena/kurum',
  title: 'Kurum Takibi',
  description: 'Sınıf ve kazanım analizi',
  badge: 'KURUM',
  icon: Building2,
  color: 'var(--focus)',
}

interface ArenaExploreGridProps {
  classroomEnabled?: boolean
  institutionEnabled?: boolean
}

export function ArenaExploreGrid({
  classroomEnabled = false,
  institutionEnabled = false,
}: ArenaExploreGridProps) {
  const [institutionVisible, setInstitutionVisible] = useState(false)

  useEffect(() => {
    if (!institutionEnabled) return
    const controller = new AbortController()
    fetch('/api/institution/workspace', {
      cache: 'no-store',
      signal: controller.signal,
    }).then((response) => {
      if (!controller.signal.aborted) setInstitutionVisible(response.ok)
    }).catch(() => {
      if (!controller.signal.aborted) setInstitutionVisible(false)
    })
    return () => controller.abort()
  }, [institutionEnabled])

  const items = [
    ...(institutionEnabled && institutionVisible ? [INSTITUTION_ITEM] : []),
    ...(classroomEnabled ? [CLASSROOM_ITEM] : []),
    ...EXPLORE_ITEMS,
  ]

  return (
    <div
      data-testid="arena-explore-grid"
      className={`grid grid-cols-2 gap-2.5 md:gap-3 ${items.length === 6
        ? 'sm:grid-cols-3 lg:grid-cols-6'
        : items.length === 5
          ? 'sm:grid-cols-3 lg:grid-cols-5'
          : 'sm:grid-cols-2 lg:grid-cols-4'}`}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group relative flex min-h-[116px] flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,transparent)] p-3 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] md:min-h-[124px] md:p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl border"
                style={{
                  borderColor: `color-mix(in srgb, ${item.color} 35%, var(--border))`,
                  backgroundColor: `color-mix(in srgb, ${item.color} 13%, var(--card-bg))`,
                  color: item.color,
                }}
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </span>
              <span
                className="rounded-full px-1.5 py-1 text-[9px] font-black tracking-[0.1em]"
                style={{
                  backgroundColor: `color-mix(in srgb, ${item.color} 12%, var(--card-bg))`,
                  color: item.color,
                }}
              >
                {item.badge}
              </span>
            </div>

            <div className="mt-3 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[var(--text)] md:text-sm">
                <span className="min-w-0 truncate">{item.title}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </div>
              <p className="mt-1 text-[11px] leading-4 text-[var(--text-sub)]">
                {item.description}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

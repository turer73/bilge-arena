'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { PROFILE_FRAMES } from '@/lib/constants/profile-frames'
import { PROFILE_NAMEPLATES } from '@/lib/constants/profile-nameplates'
import { AVATAR_DECORATIONS } from '@/lib/constants/avatar-decorations'
import { CSS_STORE_ITEMS } from '@/lib/constants/video-backgrounds'
import {
  PUBLISHED_BADGES_ENDPOINT,
  rowToBadgeItem,
  type CosmeticBadgeRow,
} from '@/lib/constants/cosmetic-badges'

/**
 * Bütçe şeridi — mağazanın giriş vitrini.
 *
 * NEDEN VAR: mağaza beş kategori sekmesine bölünmüş durumda ve kullanıcı
 * "şu an ne alabilirim" sorusunu ancak sekmeleri tek tek gezerek
 * cevaplayabiliyordu. Ölçülen sonuç: bakiyesi en ucuz ürüne yeten 10 kullanıcı
 * vardı ve toplam 1 satın alma yapılmıştı. Bu şerit soruyu kategoriden bağımsız,
 * tek bakışta cevaplar.
 *
 * Kapsam bilinçli olarak dar: yalnız KOD sabitleri + yayındaki rozetler. Video
 * arka planlar (1200–2000) hiçbir bugünkü bakiyeye sığmadığı için dışarıda —
 * bir fetch daha eklemenin karşılığı yok.
 */

type TabId = 'cerceve' | 'bg' | 'np' | 'sus' | 'badge'

interface BudgetItem {
  id: string
  name: string
  cost: number
  tab: TabId
  tabLabel: string
}

function useBudgetCatalog(): BudgetItem[] {
  const [badges, setBadges] = useState<BudgetItem[]>([])

  useEffect(() => {
    let active = true
    fetch(PUBLISHED_BADGES_ENDPOINT)
      .then((r) => (r.ok ? r.json() : { badges: [] }))
      .then((data: { badges?: CosmeticBadgeRow[] }) => {
        if (!active) return
        setBadges(
          (data.badges ?? []).map(rowToBadgeItem).map((b) => ({
            id: b.id,
            name: b.name,
            cost: b.coinCost,
            tab: 'badge' as const,
            tabLabel: 'Rozet',
          })),
        )
      })
      .catch(() => {
        /* rozet cekilemezse serit diger kategorilerle calismaya devam eder */
      })
    return () => {
      active = false
    }
  }, [])

  return useMemo(() => {
    const fromConst: BudgetItem[] = [
      ...PROFILE_FRAMES.filter((f) => f.coinCost !== undefined).map((f) => ({
        id: f.id,
        name: f.name,
        cost: f.coinCost!,
        tab: 'cerceve' as const,
        tabLabel: 'Çerçeve',
      })),
      ...AVATAR_DECORATIONS.filter((d) => d.coinCost !== undefined).map((d) => ({
        id: d.id,
        name: d.name,
        cost: d.coinCost!,
        tab: 'sus' as const,
        tabLabel: 'Süs',
      })),
      ...PROFILE_NAMEPLATES.filter((n) => n.coinCost !== undefined).map((n) => ({
        id: n.id,
        name: n.name,
        cost: n.coinCost!,
        tab: 'np' as const,
        tabLabel: 'İsim Paneli',
      })),
      ...CSS_STORE_ITEMS.filter((b) => b.coinCost !== undefined).map((b) => ({
        id: b.id,
        name: b.name,
        cost: b.coinCost!,
        tab: 'bg' as const,
        tabLabel: 'Arka Plan',
      })),
    ]
    return [...fromConst, ...badges].sort((a, b) => a.cost - b.cost)
  }, [badges])
}

export function StoreBudgetStrip({ onJump }: { onJump: (tab: TabId) => void }) {
  const { user, profile } = useAuthStore()
  const catalog = useBudgetCatalog()
  const balance = profile?.coin_balance ?? 0

  if (!user || catalog.length === 0) return null

  const affordable = catalog.filter((i) => i.cost <= balance)
  const cheapest = catalog[0]
  const missing = cheapest ? cheapest.cost - balance : 0

  return (
    <div className="mt-4 rounded-2xl border border-[var(--reward-border)] bg-[var(--reward-bg)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-sm font-black text-[var(--text)]">
          {affordable.length > 0
            ? `🪙 ${balance.toLocaleString('tr-TR')} altınınla ${affordable.length} ürün alabilirsin`
            : `🪙 ${balance.toLocaleString('tr-TR')} altının var`}
        </span>
        {affordable.length === 0 && cheapest && (
          <span className="text-xs font-bold text-[var(--text-sub)]">
            En ucuz ürün <strong className="text-[var(--reward)]">{cheapest.name}</strong> —{' '}
            <strong className="text-[var(--reward)]">{missing} altın daha</strong>
          </span>
        )}
      </div>

      {affordable.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {affordable.slice(0, 6).map((item) => (
            <button
              key={`${item.tab}-${item.id}`}
              onClick={() => onJump(item.tab)}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--focus)]"
            >
              <span className="block text-[11px] font-bold text-[var(--text)]">{item.name}</span>
              <span className="block text-[9px] text-[var(--text-muted)]">
                {item.tabLabel} · 🪙{item.cost}
              </span>
            </button>
          ))}
          {affordable.length > 6 && (
            <span className="self-center text-[10px] font-bold text-[var(--text-muted)]">
              +{affordable.length - 6} tane daha
            </span>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

/**
 * Beş kozmetik kategorisi için tek satın alma katmanı.
 *
 * Beş ayrı mağaza istemcisi (arka plan, isim paneli, avatar süsü, rozet, çerçeve)
 * aynı işi beş kez yazıyordu: POST at, hatayı toast'la, profildeki bakiye ve
 * sahiplik dizisini güncelle. Uçların tek farkı gövde anahtarı ve sahiplik
 * kolonunun adı — ikisi de aşağıdaki tabloda.
 *
 * Kişiselleştirme stüdyosu da bunu kullanır: kilitli bir ürüne tıklayınca
 * mağazaya gitmek yerine yerinde satın alınabilsin diye (bağlam kopmaz).
 */

export type CosmeticCategory =
  | 'background'
  | 'frame'
  | 'nameplate'
  | 'avatar_decoration'
  | 'cosmetic_badge'

interface EndpointConfig {
  /** /api/profile/<path>/purchase */
  path: string
  /** İstek gövdesindeki ürün id anahtarı */
  bodyKey: string
  /** Cevaptaki ve profildeki sahiplik dizisinin adı */
  ownedKey:
    | 'owned_backgrounds'
    | 'owned_frames'
    | 'owned_nameplates'
    | 'owned_avatar_decorations'
    | 'owned_cosmetic_badges'
}

const ENDPOINTS: Record<CosmeticCategory, EndpointConfig> = {
  background: { path: 'backgrounds', bodyKey: 'backgroundId', ownedKey: 'owned_backgrounds' },
  frame: { path: 'frames', bodyKey: 'frameId', ownedKey: 'owned_frames' },
  nameplate: { path: 'nameplates', bodyKey: 'nameplateId', ownedKey: 'owned_nameplates' },
  avatar_decoration: {
    path: 'avatar-decorations',
    bodyKey: 'decorationId',
    ownedKey: 'owned_avatar_decorations',
  },
  cosmetic_badge: { path: 'cosmetic-badges', bodyKey: 'badgeId', ownedKey: 'owned_cosmetic_badges' },
}

export interface PurchaseArgs {
  category: CosmeticCategory
  itemId: string
  itemName: string
}

export function useCosmeticPurchase() {
  const { profile, setProfile } = useAuthStore()
  /** Satın alınmakta olan ürünün id'si (aynı anda tek satın alma). */
  const [busyId, setBusyId] = useState<string | null>(null)

  /**
   * Satın alır ve profildeki bakiye + sahiplik dizisini günceller.
   * Başarılıysa true döner — çağıran bunu "şimdi uygula" için kullanabilir.
   */
  async function purchase({ category, itemId, itemName }: PurchaseArgs): Promise<boolean> {
    const cfg = ENDPOINTS[category]
    setBusyId(itemId)
    try {
      const res = await fetch(`/api/profile/${cfg.path}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [cfg.bodyKey]: itemId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Satın alınamadı', data.error ?? 'Bir şeyler ters gitti')
        return false
      }
      // Sunucunun döndürdüğü değerler otoriter — yerel hesap yapılmaz.
      if (profile) {
        setProfile({
          ...profile,
          coin_balance: data.coin_balance,
          [cfg.ownedKey]: data[cfg.ownedKey],
        })
      }
      toast.success(`${itemName} alındı! 🪙`, `Yeni bakiye: ${data.coin_balance}`)
      return true
    } catch {
      toast.error('Bağlantı hatası', 'Tekrar dene')
      return false
    } finally {
      setBusyId(null)
    }
  }

  return { purchase, busyId }
}

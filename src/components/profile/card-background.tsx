'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { BACKGROUND_STORAGE_KEY } from '@/lib/constants/profile-backgrounds'
import {
  CSS_STORE_ITEMS,
  rowToStoreItem,
  resolveVariantUrl,
  BACKGROUND_RESOLUTION_KEY,
  PUBLISHED_BACKGROUNDS_ENDPOINT,
  type StoreBackgroundItem,
  type BackgroundAssetRow,
  type VideoResolution,
} from '@/lib/constants/video-backgrounds'
import { resolveOwnedSelection } from '@/lib/utils/owned-selection'
import { isStaff } from '@/lib/utils/is-staff'

export interface CardBackground {
  activeBackground: StoreBackgroundItem
  activeBgVideoUrl: string | null
  isCssBg: boolean
  reducedMotion: boolean
}

/**
 * Kullanıcının seçtiği profil KART arka planını (BACKGROUND_STORAGE_KEY) çözer.
 * Profil başlık kartı VE lobi kullanıcı kartı ortak kullanır → tek kaynak,
 * ikisi her zaman aynı temayı gösterir (divergence yok). Sahiplik guard'ı +
 * personel bypass dahil. Zemin (ZEMIN_STORAGE_KEY) bundan AYRI bir seçim.
 */
export function useCardBackground(): CardBackground {
  const { profile } = useAuthStore()
  const [backgroundId, setBackgroundId] = useState('none')
  const [bgResolution, setBgResolution] = useState<VideoResolution>('k2')
  const [videoBgItems, setVideoBgItems] = useState<StoreBackgroundItem[]>([])
  const [reducedMotion, setReducedMotion] = useState(false)

  // Kart seçimi + çözünürlük tercihi (localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY)
      if (saved) setBackgroundId(saved)
      const res = localStorage.getItem(BACKGROUND_RESOLUTION_KEY)
      if (res === 'hd' || res === 'k2' || res === 'k4') setBgResolution(res)
    } catch {}
  }, [])

  // prefers-reduced-motion → video yerine poster
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Yayındaki video temaları (mağaza/profil ile aynı kaynak)
  useEffect(() => {
    let active = true
    fetch(PUBLISHED_BACKGROUNDS_ENDPOINT)
      .then((r) => (r.ok ? r.json() : { backgrounds: [] }))
      .then((data: { backgrounds: BackgroundAssetRow[] }) => {
        if (active) setVideoBgItems((data.backgrounds ?? []).map(rowToStoreItem))
      })
      .catch((e) => console.warn('[card-bg] video arka plan yukleme hatasi:', e))
    return () => {
      active = false
    }
  }, [])

  // Sahiplik guard (Codex P2): elle yazılan paid-id satın almayı atlatamasın.
  // Personel (RBAC rolü) tüm temalara sahip.
  const bgCatalog: StoreBackgroundItem[] = [...CSS_STORE_ITEMS, ...videoBgItems]
  const bgOwned = isStaff(profile) ? bgCatalog.map((c) => c.id) : profile?.owned_backgrounds
  const activeBackground = resolveOwnedSelection(backgroundId, bgOwned, bgCatalog)
  const activeBgVideoUrl =
    activeBackground.kind === 'video'
      ? resolveVariantUrl(activeBackground.variants, bgResolution)
      : null
  const isCssBg = activeBackground.kind === 'css' && activeBackground.id !== 'none'

  return { activeBackground, activeBgVideoUrl, isCssBg, reducedMotion }
}

/**
 * Kart arka planı video/poster katmanı. Kartın İLK child'ı olarak koy; kart
 * `relative isolate overflow-hidden` olmalı (katman `-z-10` ile içeriğin arkasında).
 * CSS temalar kartın `style.background`'ında render edilir (bu komponent video-only).
 */
export function CardBackgroundLayer({
  background,
  videoUrl,
  reducedMotion,
}: {
  background: StoreBackgroundItem
  videoUrl: string | null
  reducedMotion: boolean
}) {
  if (background.kind !== 'video') return null
  if (reducedMotion || !videoUrl) {
    return background.posterUrl ? (
      <img
        src={background.posterUrl}
        alt=""
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
      />
    ) : null
  }
  return (
    <video
      src={videoUrl}
      poster={background.posterUrl}
      autoPlay
      loop
      muted
      playsInline
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
    />
  )
}

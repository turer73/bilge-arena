'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { resolveOwnedSelection } from '@/lib/utils/owned-selection'
import { isStaff } from '@/lib/utils/is-staff'
import { ZEMIN_STORAGE_KEY } from '@/lib/constants/profile-backgrounds'
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

/**
 * Sayfa zemini — kullanıcının kişiselleştirme stüdyosundan ZEMİN olarak seçtiği
 * temayı TÜM arena (giriş sonrası) sayfalarının arkasına uygular. Sabit (fixed)
 * katman; içeriğin arkasında durur, okunabilirlik için üstüne yarı-saydam overlay
 * biner.
 *
 * - Zemin seçimi KARTTAN AYRI (ZEMIN_STORAGE_KEY): varsayılan 'none' → zemin sade.
 *   Mağazadan tema almak/uygulamak otomatik zemine YANSIMAZ; kullanıcı bilinçli
 *   olarak stüdyodan "zemin" seçtiğinde görünür (kullanıcı kontrolü).
 * - Yalnız `/arena*` yollarında görünür (landing/tanıtım sayfaları sade kalır).
 * - Sahiplik guard'ı (resolveOwnedSelection): localStorage'a elle yazılan
 *   sahipsiz paid-id zemini değiştiremez → 'none' (arka plan yok).
 * - Video temalar zeminde de oynar; prefers-reduced-motion → poster.
 * - Profil kartı opak olduğu için kendi bölgesinde bu katmanı kapatır (çakışma yok).
 */
export function GlobalBackground() {
  const pathname = usePathname()
  const profile = useAuthStore((s) => s.profile)
  const [backgroundId, setBackgroundId] = useState('none')
  const [resolution, setResolution] = useState<VideoResolution>('k2')
  const [videoItems, setVideoItems] = useState<StoreBackgroundItem[]>([])
  const [reducedMotion, setReducedMotion] = useState(false)

  // localStorage zemin seçimi — stüdyoda değişince anında yansısın
  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem(ZEMIN_STORAGE_KEY)
        setBackgroundId(saved || 'none')
        const res = localStorage.getItem(BACKGROUND_RESOLUTION_KEY)
        if (res === 'hd' || res === 'k2' || res === 'k4') setResolution(res)
      } catch {}
    }
    read()
    window.addEventListener('storage', read) // diğer sekmeler
    window.addEventListener('zemin-changed', read) // aynı sekme (stüdyo "Zemin")
    return () => {
      window.removeEventListener('storage', read)
      window.removeEventListener('zemin-changed', read)
    }
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

  // yayındaki video temalar (mağaza/profil ile aynı kaynak)
  useEffect(() => {
    let active = true
    fetch(PUBLISHED_BACKGROUNDS_ENDPOINT)
      .then((r) => (r.ok ? r.json() : { backgrounds: [] }))
      .then((data: { backgrounds: BackgroundAssetRow[] }) => {
        if (active) setVideoItems((data.backgrounds ?? []).map(rowToStoreItem))
      })
      .catch((e) => console.warn('[global-bg] video arka plan yukleme hatasi:', e))
    return () => {
      active = false
    }
  }, [])

  // Yalnız giriş sonrası arena alanında
  if (!pathname?.startsWith('/arena')) return null

  const catalog: StoreBackgroundItem[] = [...CSS_STORE_ITEMS, ...videoItems]
  // Personel (RBAC rolü) tüm temalara sahip → zemin guard'ı staff için bypass.
  const owned = isStaff(profile) ? catalog.map((c) => c.id) : profile?.owned_backgrounds
  const active = resolveOwnedSelection(backgroundId, owned, catalog)
  if (active.id === 'none') return null

  const videoUrl = active.kind === 'video' ? resolveVariantUrl(active.variants, resolution) : null

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {active.kind === 'video' && videoUrl && !reducedMotion ? (
        <video
          key={videoUrl}
          src={videoUrl}
          poster={active.posterUrl}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : active.kind === 'video' && active.posterUrl ? (
        <img src={active.posterUrl} alt="" className="h-full w-full object-cover" />
      ) : active.kind === 'css' ? (
        <div className={`h-full w-full ${active.animClass ?? ''}`} style={{ background: active.css }} />
      ) : null}
      {/* Okunabilirlik katmanı: tema "ambient" hissedilir ama içerik net kalır.
          /75 — parlak/hareketli videolar metni soluklaştırmasın (özellikle açık
          temada --bg beyaz wash'i zayıf kalıyordu). */}
      <div className="absolute inset-0 bg-[var(--bg)]/75" />
    </div>
  )
}

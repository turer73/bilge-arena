'use client'

import { ProfileFrameRing } from '@/components/profile/profile-frame-ring'
import { Nameplate } from '@/components/profile/nameplate'
import type { ProfileFrameDef } from '@/lib/constants/profile-frames'
import {
  resolveVariantUrl,
  type StoreBackgroundItem,
  type VideoResolution,
} from '@/lib/constants/video-backgrounds'

/**
 * Tek bir arka plan katmanı (zemin veya kart) — CSS gradient ya da video.
 * id='none' → hiçbir şey çizilmez. reduced-motion → video yerine poster.
 */
function BgLayer({
  item,
  resolution,
  reducedMotion,
}: {
  item: StoreBackgroundItem | null
  resolution: VideoResolution
  reducedMotion: boolean
}) {
  if (!item || item.id === 'none') return null
  if (item.kind === 'video') {
    const url = resolveVariantUrl(item.variants, resolution)
    if (reducedMotion || !url) {
      return item.posterUrl ? (
        <img src={item.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null
    }
    return (
      <video
        key={url}
        src={url}
        poster={item.posterUrl}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
    )
  }
  return (
    <div
      className={`absolute inset-0 h-full w-full ${item.animClass ?? ''}`}
      style={{ background: item.css }}
    />
  )
}

interface StudioPreviewProps {
  zemin: StoreBackgroundItem | null
  card: StoreBackgroundItem | null
  frame: ProfileFrameDef
  nameplateId: string | null | undefined
  resolution: VideoResolution
  reducedMotion: boolean
  displayName: string
  avatarUrl: string | null
  levelBadge: string
  levelName: string
  totalXp: number
}

/**
 * Kişiselleştirme stüdyosunun CANLI ÖNİZLEMESİ — Discord profil-düzenleme
 * tarzı. Sol/üst tarafta: seçili zemin arkada, üstünde profil kartı (kart arka
 * planı + avatar/çerçeve + isim paneli) ve "başkaları seni böyle görür" sıralama
 * satırı. Seçimler değiştikçe anında güncellenir.
 */
export function StudioPreview({
  zemin,
  card,
  frame,
  nameplateId,
  resolution,
  reducedMotion,
  displayName,
  avatarUrl,
  levelBadge,
  levelName,
  totalXp,
}: StudioPreviewProps) {
  const zeminActive = !!zemin && zemin.id !== 'none'
  const cardActive = !!card && card.id !== 'none'
  const cardIsCss = cardActive && card!.kind === 'css'

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg)] shadow-xl">
      {/* Telefon çerçevesi başlığı */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Canlı Önizleme
        </span>
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-[var(--urgency)]/60" />
          <span className="h-2 w-2 rounded-full bg-[var(--reward)]/60" />
          <span className="h-2 w-2 rounded-full bg-[var(--growth)]/60" />
        </span>
      </div>

      {/* Sahne: zemin + içerik */}
      <div className="relative min-h-[380px] overflow-hidden p-4">
        {/* Zemin katmanı */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <BgLayer item={zemin} resolution={resolution} reducedMotion={reducedMotion} />
          {zeminActive && <div className="absolute inset-0 bg-[var(--bg)]/60" />}
        </div>

        <div className="relative flex flex-col gap-3">
          {/* Profil kartı */}
          <div
            className={`relative isolate overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 ${
              cardIsCss ? (card!.animClass ?? '') : ''
            }`}
            style={cardIsCss ? { background: card!.css } : undefined}
          >
            {cardActive && card!.kind === 'video' && (
              <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
                <BgLayer item={card} resolution={resolution} reducedMotion={reducedMotion} />
              </div>
            )}
            <div className="flex items-center gap-3">
              <ProfileFrameRing frame={frame} size={48}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-12 w-12 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                    style={{ background: 'linear-gradient(135deg, var(--focus-bg), var(--focus))' }}
                  >
                    {levelBadge}
                  </div>
                )}
              </ProfileFrameRing>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold">
                  <Nameplate nameplateId={nameplateId}>{displayName}</Nameplate>
                </div>
                <div className="mt-0.5 truncate text-xs text-[var(--text-sub)]">
                  {levelBadge} {levelName} · {totalXp.toLocaleString('tr-TR')} XP
                </div>
              </div>
            </div>
          </div>

          {/* "Başkaları seni sıralamada böyle görür" satırı */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)]/90 p-3 backdrop-blur-sm">
            <p className="mb-2 text-[9px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
              Sıralamada görünüm
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[var(--text-muted)]">🥇 1</span>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface)] text-xs">
                  {levelBadge}
                </div>
              )}
              <Nameplate nameplateId={nameplateId} className="text-sm font-bold">
                {displayName}
              </Nameplate>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

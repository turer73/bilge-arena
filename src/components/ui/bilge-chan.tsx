'use client'

import Image from 'next/image'

/** Bilge Chan maskot pose'lari (public/chan/*.webp). */
export type ChanPose =
  | 'wave'
  | 'wave-shy'
  | 'idle'
  | 'reading'
  | 'victory'
  | 'tutor'
  | 'angry'
  | 'sad'

const POSE_SRC: Record<ChanPose, string> = {
  wave: '/chan/chan-wave.webp',
  'wave-shy': '/chan/chan-wave-shy.webp',
  idle: '/chan/chan-idle.webp',
  reading: '/chan/chan-reading.webp',
  victory: '/chan/chan-victory.webp',
  tutor: '/chan/chan-tutor.webp',
  angry: '/chan/chan-angry.webp',
  sad: '/chan/chan-sad.webp',
}

/** webp intrinsic boyutlari (aspect-ratio + CLS onleme icin). */
const POSE_DIM: Record<ChanPose, { w: number; h: number }> = {
  wave: { w: 476, h: 918 },
  'wave-shy': { w: 783, h: 1600 },
  idle: { w: 282, h: 931 },
  reading: { w: 474, h: 708 },
  victory: { w: 519, h: 1323 },
  tutor: { w: 498, h: 1232 },
  angry: { w: 850, h: 1600 },
  sad: { w: 561, h: 1569 },
}

/** Pose -> erişilebilir alt metni (TR, TDK diakritik). */
const POSE_ALT: Record<ChanPose, string> = {
  wave: 'Bilge Chan el sallayarak selam veriyor',
  'wave-shy': 'Bilge Chan utangaç şekilde selam veriyor',
  idle: 'Bilge Chan bekliyor',
  reading: 'Bilge Chan kitap okuyor',
  victory: 'Bilge Chan zafer işareti yapıyor',
  tutor: 'Bilge Chan ders anlatıyor',
  angry: 'Bilge Chan kızgın',
  sad: 'Bilge Chan üzgün',
}

export interface BilgeChanProps {
  pose: ChanPose
  /** Goruntulenecek yukseklik (px). Genislik aspect-ratio'dan hesaplanir. */
  height?: number
  /** LCP/above-the-fold ise true (landing hero gibi). */
  priority?: boolean
  className?: string
  /** Ozel alt metni; verilmezse pose'a gore varsayilan kullanilir. */
  alt?: string
}

/**
 * Bilge Chan maskot gorseli. next/image ile transparent webp servis eder,
 * aspect-ratio korunur (CLS yok). Pose'a gore src + boyut + alt secilir.
 */
export function BilgeChan({
  pose,
  height = 200,
  priority = false,
  className,
  alt,
}: BilgeChanProps) {
  const dim = POSE_DIM[pose]
  const width = Math.round((height * dim.w) / dim.h)
  return (
    <Image
      src={POSE_SRC[pose]}
      width={width}
      height={height}
      priority={priority}
      className={className}
      alt={alt ?? POSE_ALT[pose]}
      draggable={false}
    />
  )
}

export default BilgeChan

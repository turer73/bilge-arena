'use client'

import type { ProfileFrameDef } from '@/lib/constants/profile-frames'

interface ProfileFrameRingProps {
  frame: ProfileFrameDef
  /** Avatar boyutu px (sabit, responsive'de değişen) */
  size: number
  className?: string
  children: React.ReactNode
}

/**
 * Profil avatarının etrafına gradient/renkli çerçeve ekler.
 * children = avatar img veya emoji div (sabit boyutlu, rounded-full).
 */
export function ProfileFrameRing({ frame, size, className = '', children }: ProfileFrameRingProps) {
  if (frame.id === 'none' || frame.thickness === 0) {
    return <>{children}</>
  }

  // 1px gap: iç container biraz daha içeride durur → çerçeve ile avatar arasında boşluk
  const gap = 1
  const outer = size + frame.thickness * 2
  const innerInset = frame.thickness + gap

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: outer, height: outer, borderRadius: '9999px' }}
    >
      {/* Gradient çerçeve katmanı */}
      <div
        className={`absolute inset-0 rounded-full ${frame.animated ? 'animate-glow-pulse' : ''}`}
        style={{
          background: frame.ring,
          boxShadow: frame.glow ? `0 0 14px -2px ${frame.glow}60` : undefined,
        }}
      />

      {/* Gap + Avatar kabı */}
      <div
        className="absolute rounded-full overflow-hidden"
        style={{
          inset: innerInset,
          background: 'var(--card-bg)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/* ─── Küçük çerçeve önizleme noktası (seçici için) ─── */
interface FrameDotProps {
  frame: ProfileFrameDef
  active: boolean
  onClick: () => void
  className?: string
}

export function FrameDot({ frame, active, onClick, className = '' }: FrameDotProps) {
  if (frame.id === 'none') {
    return (
      <button
        onClick={onClick}
        title={frame.name}
        aria-label={frame.name}
        aria-pressed={active}
        className={`relative h-7 w-7 rounded-full border-2 transition-all duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${className}`}
        style={{
          borderColor: active ? 'var(--focus)' : 'var(--border)',
          background: 'var(--card-bg)',
          boxShadow: active ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--focus)' : undefined,
        }}
      >
        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--text-muted)]">✕</span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      title={frame.name}
      aria-label={frame.name}
      aria-pressed={active}
      className={`relative h-7 w-7 flex-shrink-0 rounded-full transition-all duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${className}`}
      style={{
        background: frame.ring,
        boxShadow: active
          ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${frame.preview}`
          : `0 0 6px -2px ${frame.preview}60`,
        transform: active ? 'scale(1.15)' : undefined,
      }}
    />
  )
}

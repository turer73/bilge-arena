'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'

interface LikeButtonProps {
  initialLiked?: boolean
  initialCount?: number
  onToggle?: (liked: boolean) => void
  size?: 'sm' | 'md'
  appearance?: 'default' | 'learning'
}

export function LikeButton({
  initialLiked = false,
  initialCount = 0,
  onToggle,
  size = 'sm',
  appearance = 'default',
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)

  const toggle = () => {
    const next = !liked
    setLiked(next)
    setCount((c) => c + (next ? 1 : -1))
    onToggle?.(next)
  }

  const iconSize = size === 'sm' ? 'text-xs' : 'text-sm'
  const countSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

  return (
    <button
      onClick={toggle}
      className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 py-1 transition-all ${
        appearance === 'learning'
          ? liked
            ? 'bg-[#ffe4e6] text-[#be123c]'
            : 'bg-white/80 text-[#64748b] hover:bg-white hover:text-[#be123c]'
          : liked
            ? 'bg-[color-mix(in_srgb,var(--urgency)_12%,transparent)] text-[var(--urgency)]'
            : 'text-[var(--text-sub)] hover:bg-[var(--card)] hover:text-[var(--urgency)]'
      }`}
      aria-label={liked ? 'Begeniyi geri al' : 'Begen'}
    >
      {appearance === 'learning' ? (
        <Heart
          className={`${size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} transition-transform ${liked ? 'scale-110 fill-current' : ''}`}
          aria-hidden="true"
        />
      ) : (
        <span className={`${iconSize} transition-transform ${liked ? 'scale-125' : ''}`}>
          {liked ? '❤️' : '🤍'}
        </span>
      )}
      {count > 0 && (
        <span className={`${countSize} font-bold`}>{count}</span>
      )}
    </button>
  )
}

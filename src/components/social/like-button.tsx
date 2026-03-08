'use client'

import { useState } from 'react'

interface LikeButtonProps {
  initialLiked?: boolean
  initialCount?: number
  onToggle?: (liked: boolean) => void
  size?: 'sm' | 'md'
}

export function LikeButton({
  initialLiked = false,
  initialCount = 0,
  onToggle,
  size = 'sm',
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
      className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-all ${
        liked
          ? 'bg-[color-mix(in_srgb,var(--urgency)_12%,transparent)] text-[var(--urgency)]'
          : 'text-[var(--text-sub)] hover:bg-[var(--card)] hover:text-[var(--urgency)]'
      }`}
      aria-label={liked ? 'Begeniyi geri al' : 'Begen'}
    >
      <span className={`${iconSize} transition-transform ${liked ? 'scale-125' : ''}`}>
        {liked ? '❤️' : '🤍'}
      </span>
      {count > 0 && (
        <span className={`${countSize} font-bold`}>{count}</span>
      )}
    </button>
  )
}

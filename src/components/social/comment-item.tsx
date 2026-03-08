'use client'

import { LikeButton } from './like-button'

interface CommentItemProps {
  avatar: string
  name: string
  levelBadge: string
  content: string
  timeAgo: string
  likes: number
  isLiked?: boolean
  isOwn?: boolean
  onLikeToggle?: (liked: boolean) => void
  onDelete?: () => void
}

export function CommentItem({
  avatar,
  name,
  levelBadge,
  content,
  timeAgo,
  likes,
  isLiked = false,
  isOwn = false,
  onLikeToggle,
  onDelete,
}: CommentItemProps) {
  return (
    <div className="flex gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--card)]">
      {/* Avatar */}
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-sm">
        {avatar}
      </div>

      {/* Icerik */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold">{name}</span>
          <span className="text-[9px] text-[var(--text-sub)]">{levelBadge}</span>
          <span className="text-[9px] text-[var(--text-sub)]">·</span>
          <span className="text-[9px] text-[var(--text-sub)]">{timeAgo}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-sub)]">{content}</p>
        <div className="mt-1 flex items-center gap-2">
          <LikeButton
            initialLiked={isLiked}
            initialCount={likes}
            onToggle={onLikeToggle}
            size="sm"
          />
          {isOwn && onDelete && (
            <button
              onClick={onDelete}
              className="text-[10px] text-[var(--text-sub)] hover:text-[var(--urgency)] transition-colors"
            >
              Sil
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

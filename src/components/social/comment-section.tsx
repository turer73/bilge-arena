'use client'

import { useState } from 'react'
import { CommentItem } from './comment-item'

interface Comment {
  id: string
  avatar: string
  name: string
  levelBadge: string
  content: string
  timeAgo: string
  likes: number
  isLiked: boolean
  isOwn: boolean
}

interface CommentSectionProps {
  questionId: string
  isLoggedIn?: boolean
}

// Mock data — Supabase baglaninca gercek veri gelecek
const MOCK_COMMENTS: Comment[] = [
  {
    id: '1',
    avatar: '🦊',
    name: 'Zeynep K.',
    levelBadge: '🌟 Bilgin',
    content: 'Bu soruyu is-havuz formulu ile daha hizli cozebilirsiniz: 1/a + 1/b = 1/t',
    timeAgo: '2s once',
    likes: 5,
    isLiked: false,
    isOwn: false,
  },
  {
    id: '2',
    avatar: '🐉',
    name: 'Emre T.',
    levelBadge: '⚔️ Savasci',
    content: 'Cok guzel soru, tesekkurler! TYT\'de benzer kaliplar cikiyor.',
    timeAgo: '1g once',
    likes: 2,
    isLiked: true,
    isOwn: false,
  },
]

export function CommentSection({ questionId, isLoggedIn = false }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS)
  const [newComment, setNewComment] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  const handleSubmit = () => {
    if (!newComment.trim()) return

    const comment: Comment = {
      id: Date.now().toString(),
      avatar: '🦉',
      name: 'Sen',
      levelBadge: '🌱 Acemi',
      content: newComment.trim(),
      timeAgo: 'simdi',
      likes: 0,
      isLiked: false,
      isOwn: true,
    }

    setComments((prev) => [comment, ...prev])
    setNewComment('')
  }

  const handleDelete = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      {/* Baslik */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">💬</span>
          <span className="text-xs font-bold">Yorumlar</span>
          <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-sub)]">
            {comments.length}
          </span>
        </div>
        <span className={`text-xs text-[var(--text-sub)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--border)] px-3 py-3">
          {/* Yorum yaz */}
          {isLoggedIn ? (
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Yorumunu yaz..."
                maxLength={500}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-sub)] focus:border-[var(--focus)] focus:outline-none"
              />
              <button
                onClick={handleSubmit}
                disabled={!newComment.trim()}
                className="rounded-lg bg-[var(--focus)] px-3 py-2 text-[10px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Gonder
              </button>
            </div>
          ) : (
            <div className="mb-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-center text-[10px] text-[var(--text-sub)]">
              Yorum yapmak icin giris yap
            </div>
          )}

          {/* Yorum listesi */}
          <div className="flex flex-col gap-1">
            {comments.length === 0 ? (
              <div className="py-4 text-center text-xs text-[var(--text-sub)]">
                Henuz yorum yok. Ilk yorumu sen yaz!
              </div>
            ) : (
              comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  avatar={comment.avatar}
                  name={comment.name}
                  levelBadge={comment.levelBadge}
                  content={comment.content}
                  timeAgo={comment.timeAgo}
                  likes={comment.likes}
                  isLiked={comment.isLiked}
                  isOwn={comment.isOwn}
                  onLikeToggle={() => {}}
                  onDelete={comment.isOwn ? () => handleDelete(comment.id) : undefined}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { CommentItem } from './comment-item'
import { commentContentSchema, LIMITS } from '@/lib/validations/schemas'

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

/** API response satir tipi (Madde 9 #8 — /api/comments proxy) */
interface CommentApiDto {
  id: string
  content: string
  likes_count: number
  created_at: string
  user_id: string
  is_own: boolean
  is_liked: boolean
  profile: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
    level_name: string | null
  }
}

interface CommentSectionProps {
  questionId: string
  isLoggedIn?: boolean
}

const LEVEL_BADGES: Record<string, string> = {
  Acemi: '🌱 Acemi',
  Cirak: '⚔️ Cirak',
  Uzman: '🌟 Uzman',
  Usta: '🏆 Usta',
  Efsane: '👑 Efsane',
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return 'simdi'
  if (diff < 3600) return `${Math.floor(diff / 60)}dk once`
  if (diff < 86400) return `${Math.floor(diff / 3600)}s once`
  if (diff < 604800) return `${Math.floor(diff / 86400)}g once`
  return `${Math.floor(diff / 604800)}h once`
}

function mapDto(c: CommentApiDto): Comment {
  const p = c.profile
  return {
    id: c.id,
    avatar: p?.avatar_url ? '👤' : '🦉',
    name: p?.username || p?.display_name || 'Anonim',
    levelBadge: LEVEL_BADGES[p?.level_name || 'Acemi'] || '🌱 Acemi',
    content: c.content,
    timeAgo: getTimeAgo(c.created_at),
    likes: c.likes_count || 0,
    isLiked: c.is_liked,
    isOwn: c.is_own,
  }
}

export function CommentSection({ questionId, isLoggedIn = false }: CommentSectionProps) {
  const { profile } = useAuthStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Yorumlari API'dan cek (Madde 9 #8 proxy)
  const fetchComments = useCallback(async () => {
    if (!isExpanded) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comments?questionId=${encodeURIComponent(questionId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setComments([])
        return
      }
      const json = (await res.json()) as { comments: CommentApiDto[] }
      setComments((json.comments ?? []).map(mapDto))
    } catch (err) {
      console.error('[Comments] Fetch hatasi:', err)
    } finally {
      setLoading(false)
    }
  }, [isExpanded, questionId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Yeni yorum gonder
  const handleSubmit = async () => {
    if (!isLoggedIn || submitting) return

    const parsed = commentContentSchema.safeParse(newComment)
    if (!parsed.success) return

    setSubmitting(true)
    const cleanContent = parsed.data

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, content: cleanContent }),
      })
      if (!res.ok) {
        setSubmitting(false)
        return
      }
      const data = (await res.json()) as { id: string; created_at: string }

      const optimistic: Comment = {
        id: data.id,
        avatar: profile?.avatar_url ? '👤' : '🦉',
        name: profile?.username || profile?.display_name || 'Sen',
        levelBadge: LEVEL_BADGES[profile?.level_name || 'Acemi'] || '🌱 Acemi',
        content: cleanContent,
        timeAgo: 'simdi',
        likes: 0,
        isLiked: false,
        isOwn: true,
      }

      setComments((prev) => [optimistic, ...prev])
      setNewComment('')
    } catch (err) {
      console.error('[Comments] Submit hatasi:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Yorum sil (soft delete)
  const handleDelete = async (commentId: string) => {
    if (!isLoggedIn) return
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        console.error('[Comments] Silme hatasi:', res.status)
        return
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch (err) {
      console.error('[Comments] Delete hatasi:', err)
    }
  }

  // Begeni toggle (optimistic + error rollback)
  const handleLikeToggle = async (commentId: string, liked: boolean) => {
    if (!isLoggedIn) return

    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, isLiked: liked, likes: liked ? c.likes + 1 : Math.max(0, c.likes - 1) }
          : c,
      ),
    )

    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}/like`, {
        method: liked ? 'POST' : 'DELETE',
      })
      if (!res.ok) {
        throw new Error('Like API failed')
      }
    } catch (err) {
      console.error('[Comments] Like hatasi:', err)
      // Rollback
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isLiked: !liked, likes: liked ? Math.max(0, c.likes - 1) : c.likes + 1 }
            : c,
        ),
      )
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
        aria-expanded={isExpanded}
        aria-label={`Yorumlar ${isExpanded ? 'gizle' : 'goster'}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">💬</span>
          <span className="text-xs font-bold">Yorumlar</span>
          {comments.length > 0 && (
            <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-sub)]">
              {comments.length}
            </span>
          )}
        </div>
        <span className={`text-xs text-[var(--text-sub)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--border)] px-3 py-3">
          {isLoggedIn ? (
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Yorumunu yaz..."
                maxLength={LIMITS.COMMENT_MAX_LENGTH}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-sub)] focus:border-[var(--focus)] focus:outline-none"
              />
              <button
                onClick={handleSubmit}
                disabled={!newComment.trim() || submitting}
                className="rounded-lg bg-[var(--focus)] px-3 py-2 text-[10px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? '...' : 'Gonder'}
              </button>
            </div>
          ) : (
            <div className="mb-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-center text-[10px] text-[var(--text-sub)]">
              Yorum yapmak icin giris yap
            </div>
          )}

          <div className="flex flex-col gap-1">
            {loading ? (
              <div className="py-4 text-center text-xs text-[var(--text-sub)]">
                Yukleniyor...
              </div>
            ) : comments.length === 0 ? (
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
                  onLikeToggle={(liked) => handleLikeToggle(comment.id, liked)}
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

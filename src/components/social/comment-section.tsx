'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
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

/** comments + profiles JOIN satir tipi */
interface CommentRow {
  id: string
  content: string
  likes_count: number
  created_at: string
  user_id: string
  profiles: {
    display_name: string | null
    avatar_url: string | null
    level_name: string | null
  }
}

interface CommentSectionProps {
  questionId: string
  isLoggedIn?: boolean
}

// ---------- Helpers ----------

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

export function CommentSection({ questionId, isLoggedIn = false }: CommentSectionProps) {
  const { user, profile } = useAuthStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Yorumlari Supabase'den cek
  const fetchComments = useCallback(async () => {
    if (!isExpanded) return
    setLoading(true)

    const supabase = createClient()

    // Supabase !inner JOIN: profiles many-to-one oldugu icin
    // runtime'da tek obje doner, ama TS array cikarir.
    // returns<CommentRow[]>() ile sorgu seviyesinde tipi belirle.
    const { data: commentsData, error } = await supabase
      .from('comments')
      .select('id, content, likes_count, created_at, user_id, profiles!inner(display_name, avatar_url, level_name)')
      .eq('question_id', questionId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<CommentRow[]>()

    if (error) {
      console.error('[Comments] Yorum cekme hatasi:', error)
      setLoading(false)
      return
    }

    // Kullanicinin begenilerini kontrol et
    let userLikes = new Set<string>()
    if (user) {
      const { data: likesData } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', user.id)

      if (likesData) {
        userLikes = new Set(likesData.map((l) => l.comment_id))
      }
    }

    // UI formatina cevir
    const mapped: Comment[] = (commentsData || []).map((c) => {
      const p = c.profiles
      return {
        id: c.id,
        avatar: p?.avatar_url ? '👤' : '🦉',
        name: p?.display_name || 'Anonim',
        levelBadge: LEVEL_BADGES[p?.level_name || 'Acemi'] || '🌱 Acemi',
        content: c.content,
        timeAgo: getTimeAgo(c.created_at),
        likes: c.likes_count || 0,
        isLiked: userLikes.has(c.id),
        isOwn: c.user_id === user?.id,
      }
    })

    setComments(mapped)
    setLoading(false)
  }, [isExpanded, questionId, user])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Yeni yorum gonder
  const handleSubmit = async () => {
    if (!user || submitting) return

    // Zod ile dogrula + trim
    const parsed = commentContentSchema.safeParse(newComment)
    if (!parsed.success) return

    setSubmitting(true)
    const cleanContent = parsed.data

    const supabase = createClient()
    const { data, error } = await supabase
      .from('comments')
      .insert({
        user_id: user.id,
        question_id: questionId,
        content: cleanContent,
      })
      .select('id, created_at')
      .single()

    if (error) {
      console.error('[Comments] Yorum gonderme hatasi:', error)
      setSubmitting(false)
      return
    }

    // Optimistic update
    const optimistic: Comment = {
      id: data.id,
      avatar: profile?.avatar_url ? '👤' : '🦉',
      name: profile?.display_name || 'Sen',
      levelBadge: LEVEL_BADGES[profile?.level_name || 'Acemi'] || '🌱 Acemi',
      content: cleanContent,
      timeAgo: 'simdi',
      likes: 0,
      isLiked: false,
      isOwn: true,
    }

    setComments((prev) => [optimistic, ...prev])
    setNewComment('')
    setSubmitting(false)
  }

  // Yorum sil (soft delete)
  const handleDelete = async (commentId: string) => {
    if (!user) return
    const supabase = createClient()

    const { error } = await supabase
      .from('comments')
      .update({ is_deleted: true })
      .eq('id', commentId)
      .eq('user_id', user.id)

    if (error) {
      console.error('[Comments] Silme hatasi:', error)
      return
    }

    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  // Begeni toggle
  const handleLikeToggle = async (commentId: string, liked: boolean) => {
    if (!user) return
    const supabase = createClient()

    if (liked) {
      await supabase
        .from('comment_likes')
        .insert({ user_id: user.id, comment_id: commentId })
    } else {
      await supabase
        .from('comment_likes')
        .delete()
        .eq('user_id', user.id)
        .eq('comment_id', commentId)
    }

    // Optimistic update — likes_count DB trigger ile guncellenir
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, isLiked: liked, likes: liked ? c.likes + 1 : Math.max(0, c.likes - 1) }
          : c
      )
    )
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
          {/* Yorum yaz */}
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

          {/* Yorum listesi */}
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

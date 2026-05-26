import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { commentContentSchema } from '@/lib/validations/schemas'
import { isValidUuid } from '@/lib/utils/uuid'

const listIpLimiter = createRateLimiter('comments-list-ip', 120, 60_000)
const listUserLimiter = createRateLimiter('comments-list-user', 60, 60_000)
const createIpLimiter = createRateLimiter('comments-create-ip', 30, 60_000)
const createUserLimiter = createRateLimiter('comments-create-user', 10, 60_000)

interface CommentRow {
  id: string
  content: string
  likes_count: number
  created_at: string
  user_id: string
  profiles: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
    level_name: string | null
  } | null
}

interface CommentDto {
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

// Klipper review P1: zayif UUID regex kaldirildi, ortak helper kullaniliyor
// (src/lib/utils/uuid.ts -> isValidUuid). Eski /^[0-9a-f-]{36}$/i dash
// konumlari yanlis stringleri de gecirip PostgreSQL cast 22P02 fail eder.

/**
 * GET /api/comments?questionId=X
 *
 * Soruya ait yorumlari (son 50) + auth'lu kullanicinin like'larini doner.
 * Anon kullanici de okuyabilir (yorumlar public), ama like bilgisi sadece auth icin.
 *
 * Madde 9 #8 (pentest raporu): Browser->Supabase direkt cagri yerine bu proxy.
 *
 * Cache: no-store (yorum sayisi/yeni yorumlar anlik degisebilir)
 * Rate limit: IP 120/dk + user 60/dk
 */
export async function GET(request: NextRequest) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await listIpLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth (optional)
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()

  if (user) {
    const userRl = await listUserLimiter.check(user.id)
    if (!userRl.success) {
      return NextResponse.json(
        { error: 'Cok fazla istek' },
        { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
      )
    }
  }

  // 3) Query param
  const questionId = new URL(request.url).searchParams.get('questionId')
  if (!questionId || !isValidUuid(questionId)) {
    return NextResponse.json({ error: 'questionId gecersiz' }, { status: 400 })
  }

  // 4) Service-role: yorumlar + (auth ise) user likes paralel
  const admin = createServiceRoleClient()
  const [commentsRes, likesRes] = await Promise.all([
    admin
      .from('comments')
      .select('id, content, likes_count, created_at, user_id, profiles!inner(username, display_name, avatar_url, level_name)')
      .eq('question_id', questionId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<CommentRow[]>(),
    user
      ? admin
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
      : Promise.resolve({ data: [] as Array<{ comment_id: string }>, error: null }),
  ])

  if (commentsRes.error) {
    console.error('[/api/comments GET] error:', commentsRes.error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  const likedIds = new Set((likesRes.data ?? []).map(l => l.comment_id))

  const comments: CommentDto[] = (commentsRes.data ?? []).map(c => ({
    id: c.id,
    content: c.content,
    likes_count: c.likes_count ?? 0,
    created_at: c.created_at,
    user_id: c.user_id,
    is_own: c.user_id === user?.id,
    is_liked: likedIds.has(c.id),
    profile: {
      username: c.profiles?.username ?? null,
      display_name: c.profiles?.display_name ?? null,
      avatar_url: c.profiles?.avatar_url ?? null,
      level_name: c.profiles?.level_name ?? null,
    },
  }))

  return NextResponse.json(
    { comments },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * POST /api/comments
 * Body: { questionId, content }
 *
 * Yeni yorum ekler. Auth zorunlu.
 * Madde 9 #8: client INSERT yerine proxy.
 *
 * Rate limit: IP 30/dk + user 10/dk (yorum spam'ini engelle)
 */
export async function POST(request: NextRequest) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await createIpLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth check
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // 3) User rate limit
  const userRl = await createUserLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok hizli istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  // 4) Body validation
  const body = await request.json()
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Gecersiz body' }, { status: 400 })
  }
  const questionId = body.questionId
  if (!questionId || typeof questionId !== 'string' || !isValidUuid(questionId)) {
    return NextResponse.json({ error: 'questionId gecersiz' }, { status: 400 })
  }
  const contentParse = commentContentSchema.safeParse(body.content)
  if (!contentParse.success) {
    return NextResponse.json(
      { error: contentParse.error.issues[0]?.message || 'Gecersiz icerik' },
      { status: 400 },
    )
  }

  // 5) Content dedup — ayni kullanici, ayni soru, ayni icerik 60 dk icinde tekrar yorum yapamaz (H-149-2)
  const admin = createServiceRoleClient()
  const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: existing } = await admin
    .from('comments')
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .eq('content', contentParse.data)
    .eq('is_deleted', false)
    .gte('created_at', sixtyMinAgo)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Bu yorumu zaten gönderdiniz' },
      { status: 409 },
    )
  }

  // 6) Service-role insert
  const { data, error } = await admin
    .from('comments')
    .insert({
      user_id: user.id,
      question_id: questionId,
      content: contentParse.data,
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('[/api/comments POST] error:', error.code)
    return NextResponse.json({ error: 'Yorum kaydedilemedi' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, created_at: data.created_at }, { status: 201 })
}

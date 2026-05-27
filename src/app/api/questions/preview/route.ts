import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAME_SLUGS } from '@/lib/constants/games'
import type { Question } from '@/types/database'

// Misafir önizlemesi için kısıtlı IP rate limit: 20/saat
const ipLimiter = createRateLimiter('questions-preview-ip', 20, 3_600_000)

const VALID_GAMES = new Set(GAME_SLUGS)
const VALID_EXAM_REFS = new Set(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ'])

/**
 * GET /api/questions/preview?game=X[&category=Y&difficulty=Z&examRef=TYT]
 *
 * Auth gerektirmeyen misafir önizleme endpointi.
 * Kayıt olmadan oynamayı deneyen kullanıcılara 1 gerçek soru verir.
 * Seçili filtreler (kategori, zorluk, sınav) uygulanır.
 * Filtreyle soru bulunamazsa filtreler kaldırılarak tekrar denenir (fallback).
 *
 * - Auth yok (anon erişim)
 * - Service-role ile DB'den random aktif soru
 * - IP rate limit: 20/saat
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 3600) } },
    )
  }

  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')
  if (!game || !VALID_GAMES.has(game as never)) {
    return NextResponse.json({ error: 'Geçerli oyun belirtilmedi' }, { status: 400 })
  }

  const category = searchParams.get('category') || null
  const difficultyRaw = searchParams.get('difficulty')
  const difficulty = difficultyRaw ? parseInt(difficultyRaw, 10) : null
  const examRefRaw = searchParams.get('examRef')
  const examRef = examRefRaw && VALID_EXAM_REFS.has(examRefRaw) ? examRefRaw : null

  const admin = createServiceRoleClient()

  // Filtreli RPC argümanları
  const rpcArgs: {
    p_game: string
    p_limit: number
    p_category?: string
    p_difficulty?: number
    p_exam_ref?: string
  } = { p_game: game, p_limit: 3 }

  if (category) rpcArgs.p_category = category
  if (difficulty && Number.isFinite(difficulty)) rpcArgs.p_difficulty = difficulty
  if (examRef) rpcArgs.p_exam_ref = examRef

  let { data, error } = await admin.rpc('select_random_questions', rpcArgs)

  // Filtreyle soru gelmezse filtreler olmadan tekrar dene
  if (!error && (!data || (data as Question[]).length === 0) && (category || difficulty || examRef)) {
    const fallback = await admin.rpc('select_random_questions', { p_game: game, p_limit: 3 })
    if (!fallback.error) {
      data = fallback.data
      error = fallback.error
    }
  }

  if (error) {
    console.error('[/api/questions/preview] RPC hatası:', error.code)
    return NextResponse.json({ error: 'Soru alınamadı' }, { status: 500 })
  }

  const questions = (data ?? []) as Question[]
  const question = questions[0] ?? null

  return NextResponse.json(
    { question },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

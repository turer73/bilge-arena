import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { validateSubmission } from '@/lib/validations/question-submission'

// Çift kalkan (Madde 9 paterni): IP limiti auth'tan ÖNCE (Auth quota koruması)
const ipLimiter = createRateLimiter('question-submit-ip', 30, 3_600_000) // 30/saat
const userLimiter = createRateLimiter('question-submit-user', 10, 3_600_000) // 10/saat

/**
 * POST /api/questions/submit — UGC soru gönderimi (flywheel Faz-1).
 *
 * Auth zorunlu. Gönderi `question_submissions` tablosuna pending düşer;
 * admin moderasyon kuyruğu (/admin/gonderiler) onaylarsa questions'a
 * source='ugc', is_active=false ile kopyalanır (aktivasyon /admin/sorular).
 * Tabloya INSERT yalnızca service-role — browser doğrudan yazamaz.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 3600) } },
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Soru göndermek için giriş yapmalısın' }, { status: 401 })
  }

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Günlük gönderim sınırına ulaştın, yarın tekrar dene' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 3600) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }

  const result = validateSubmission(body)
  if (!result.ok || !result.value) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  const v = result.value

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('question_submissions')
    .insert({
      user_id: user.id,
      game: v.game,
      category: v.category,
      difficulty: v.difficulty,
      content: {
        question: v.question,
        options: v.options,
        answer: v.answer,
        ...(v.solution ? { solution: v.solution } : {}),
      },
    })
    .select('id')
    .single()

  if (error) {
    console.error('[questions/submit] insert hatası:', error.code)
    return NextResponse.json({ error: 'Gönderim kaydedilemedi' }, { status: 500 })
  }

  return NextResponse.json({ status: 'pending', id: data.id }, { status: 201 })
}

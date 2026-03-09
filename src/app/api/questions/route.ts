import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const questionsLimiter = createRateLimiter('questions', 60, 60_000) // 60 req/dk

/** parseInt ile boundary kontrolu: min <= val <= max */
function safeInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(value ?? String(fallback))
  if (isNaN(n) || n < min) return fallback
  return Math.min(n, max)
}

export async function GET(request: NextRequest) {
  // Rate limiting (IP bazli — GET public endpoint)
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rl = questionsLimiter.check(ip)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek. Lutfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
    )
  }

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const game = searchParams.get('game')
  const category = searchParams.get('category')
  const difficulty = searchParams.get('difficulty')
  const active = searchParams.get('active')
  const page = safeInt(searchParams.get('page'), 1, 1, 1000)
  const limit = safeInt(searchParams.get('limit'), 20, 1, 100)
  const offset = (page - 1) * limit

  let query = supabase
    .from('questions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (game) query = query.eq('game', game)
  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', parseInt(difficulty))
  if (active === 'true') query = query.eq('is_active', true)
  if (active === 'false') query = query.eq('is_active', false)

  const { data, count, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ questions: data, total: count, page, limit })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { questionId, updates } = body

  if (!questionId) {
    return NextResponse.json({ error: 'Missing questionId' }, { status: 400 })
  }

  const { error } = await supabase
    .from('questions')
    .update(updates)
    .eq('id', questionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Admin log
  await supabase.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'update_question',
    target_type: 'question',
    target_id: questionId,
    details: updates,
  })

  return NextResponse.json({ success: true })
}

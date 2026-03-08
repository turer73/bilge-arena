import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const game = searchParams.get('game')
  const category = searchParams.get('category')
  const difficulty = searchParams.get('difficulty')
  const active = searchParams.get('active')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
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

  // Admin kontrolu
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { questionId, updates } = body

  if (!questionId) {
    return NextResponse.json({ error: 'Missing questionId' }, { status: 400 })
  }

  const { error } = await (supabase as any)
    .from('questions')
    .update(updates)
    .eq('id', questionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Admin log
  await (supabase as any).from('admin_logs').insert({
    admin_id: user.id,
    action: 'update_question',
    target_type: 'question',
    target_id: questionId,
    details: updates,
  })

  return NextResponse.json({ success: true })
}

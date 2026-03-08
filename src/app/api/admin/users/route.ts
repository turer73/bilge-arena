import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const search = searchParams.get('search') ?? ''
  const limit = 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`display_name.ilike.%${search}%,username.ilike.%${search}%`)
  }

  const { data: users, count } = await query.range(offset, offset + limit - 1)

  return NextResponse.json({ users, total: count, page, limit })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, action } = body

  if (!userId || !action) {
    return NextResponse.json({ error: 'Missing userId or action' }, { status: 400 })
  }

  if (action === 'promote') {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId)
  } else if (action === 'demote') {
    await supabase.from('profiles').update({ role: 'user' }).eq('id', userId)
  }

  // Admin log kaydet
  await supabase.from('admin_logs').insert({
    admin_id: admin.id,
    action,
    target_type: 'user',
    target_id: userId,
    details: { action },
  })

  return NextResponse.json({ success: true })
}

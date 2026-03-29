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
  const rawPage = parseInt(searchParams.get('page') ?? '1')
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, 1000)
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

  // Gecerli action kontrolu
  if (!['promote', 'demote'].includes(action)) {
    return NextResponse.json({ error: 'Gecersiz action' }, { status: 400 })
  }

  // Admin kendini demote edemez
  if (action === 'demote' && userId === admin.id) {
    return NextResponse.json({ error: 'Kendinizi demote edemezsiniz' }, { status: 400 })
  }

  const newRole = action === 'promote' ? 'admin' : 'user'
  const { data: affected } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)
    .select('id')

  if (!affected || affected.length === 0) {
    return NextResponse.json({ error: 'Kullanici bulunamadi' }, { status: 404 })
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

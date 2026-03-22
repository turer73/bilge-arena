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
  const action = searchParams.get('action')
  const targetType = searchParams.get('target_type')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))
  const offset = (page - 1) * limit

  let query = supabase
    .from('admin_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (action) query = query.eq('action', action)
  if (targetType) query = query.eq('target_type', targetType)

  const { data, count, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Admin isimlerini cek
  const adminIds = Array.from(new Set((data ?? []).map(l => l.admin_id)))
  const { data: profiles } = adminIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, username').in('id', adminIds)
    : { data: [] }

  const profileMap: Record<string, string> = {}
  for (const p of profiles ?? []) {
    profileMap[p.id] = p.display_name || p.username || 'Admin'
  }

  const logs = (data ?? []).map(l => ({
    ...l,
    admin_name: profileMap[l.admin_id] || 'Bilinmeyen',
  }))

  return NextResponse.json({ logs, total: count ?? 0, page, limit })
}

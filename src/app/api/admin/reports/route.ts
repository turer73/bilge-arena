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
  const status = searchParams.get('status')
  const rawPage = parseInt(searchParams.get('page') ?? '1')
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, 1000)
  const limit = 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('error_reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: reports, count, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reports, total: count, page, limit })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { reportId, status, adminNote } = body

  if (!reportId || !status) {
    return NextResponse.json({ error: 'Missing reportId or status' }, { status: 400 })
  }

  // Gecerli status degerleri
  const VALID_STATUSES = ['pending', 'in_review', 'resolved', 'dismissed']
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Gecersiz status degeri' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { status }
  if (adminNote !== undefined) updates.admin_note = adminNote
  if (status === 'resolved') updates.resolved_by = admin.id

  const { error } = await supabase
    .from('error_reports')
    .update(updates)
    .eq('id', reportId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Admin log
  await supabase.from('admin_logs').insert({
    admin_id: admin.id,
    action: `report_${status}`,
    target_type: 'report',
    target_id: reportId,
    details: { status, adminNote },
  })

  return NextResponse.json({ success: true })
}

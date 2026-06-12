import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'

const VALID_STATUS = new Set(['pending', 'approved', 'rejected'])

/**
 * GET /api/admin/submissions?status=pending — UGC moderasyon kuyruğu.
 * Gönderen kullanıcı adıyla birlikte listeler (en yeni önce).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.questions.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const statusRaw = searchParams.get('status') ?? 'pending'
  const status = VALID_STATUS.has(statusRaw) ? statusRaw : 'pending'

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('question_submissions')
    .select('id, user_id, game, category, difficulty, content, status, review_note, created_at, profiles!question_submissions_user_id_fkey(username, display_name)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[admin/submissions] sorgu hatası:', error.code)
    return NextResponse.json({ error: 'Gönderimler alınamadı' }, { status: 500 })
  }

  return NextResponse.json({ submissions: data ?? [] })
}

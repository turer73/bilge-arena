import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isValidUuid } from '@/lib/utils/uuid'

interface ReadBody {
  id?: string
  all?: boolean
}

/**
 * POST /api/notifications/read — bildirim(ler)i okundu işaretle.
 * Body: { all: true } tümünü, { id } tekini. Yazma service-role ile
 * (client write grant'i yok) ama HER ZAMAN auth.uid() user_id eşitliğiyle
 * kısıtlanır — başkasının bildirimine dokunulamaz.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  let body: ReadBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }

  // Validasyon ÖNCE — geçersiz istekte hiç sorgu kurma
  const markAll = body.all === true
  const markOne = !markAll && typeof body.id === 'string' && isValidUuid(body.id)
  if (!markAll && !markOne) {
    return NextResponse.json({ error: 'id veya all gerekli' }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const base = svc.from('notifications').update({ is_read: true }).eq('user_id', user.id)
  const q = markAll ? base.eq('is_read', false) : base.eq('id', body.id!)

  const { error } = await q
  if (error) {
    console.error('[notifications/read] hatası:', error.code)
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

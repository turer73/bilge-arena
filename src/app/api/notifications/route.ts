import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/notifications — kullanıcının son bildirimleri + okunmamış sayısı.
 * RLS-respecting cookie client: select-own policy zaten kendi satırlarına
 * kısıtlar (notifications authenticated'a yalnızca SELECT verir).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, link, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error('[notifications] liste hatası:', error.code)
    return NextResponse.json({ error: 'Bildirimler alınamadı' }, { status: 500 })
  }

  const notifications = data ?? []
  const unread = notifications.filter((n) => !n.is_read).length
  return NextResponse.json(
    { notifications, unread },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

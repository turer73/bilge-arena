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

  // Liste (son 30) + okunmamış sayısı AYRI sorgu: rozet sayfa boyutundan
  // bağımsız olmalı (Codex P2 — 30+ bildirimde sayfadan saymak rozeti
  // yanlış/0 gösterir). RLS her iki sorguyu da kendi satırlarına kısıtlar.
  const [{ data, error }, { count, error: countErr }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, type, title, body, link, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false),
  ])

  if (error || countErr) {
    console.error('[notifications] liste hatası:', error?.code ?? countErr?.code)
    return NextResponse.json({ error: 'Bildirimler alınamadı' }, { status: 500 })
  }

  return NextResponse.json(
    { notifications: data ?? [], unread: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

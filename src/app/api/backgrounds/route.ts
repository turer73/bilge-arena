import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import type { BackgroundAssetRow } from '@/lib/constants/video-backgrounds'

const ipLimiter = createRateLimiter('backgrounds-list-ip', 60, 60_000)

/**
 * GET /api/backgrounds — Yayındaki video temalar (public).
 *
 * Mağaza ve profil bunu çeker. Service-role + is_published filtre:
 * RLS karmaşasına girmeden yalnızca yayında olan temalar döner
 * (taslak/yayınsız temalar sızmaz).
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = await ipLimiter.check(ip)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('background_assets')
    .select(
      'id, slug, name, description, category, rarity, coin_cost, variants, poster_url, is_published, created_at',
    )
    .eq('is_published', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[backgrounds] liste hatası:', error.message)
    return NextResponse.json({ error: 'Liste alınamadı' }, { status: 500 })
  }

  return NextResponse.json({ backgrounds: (data ?? []) as BackgroundAssetRow[] })
}

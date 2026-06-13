import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import type { CosmeticBadgeRow } from '@/lib/constants/cosmetic-badges'

const ipLimiter = createRateLimiter('cosmetic-badges-list-ip', 60, 60_000)

/**
 * GET /api/cosmetic-badges — Yayındaki kozmetik rozetler (public).
 * Mağaza ve profil çeker. Service-role + is_published filtre (taslak sızmaz).
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
    .from('cosmetic_badges')
    .select('id, slug, name, description, category, rarity, coin_cost, icon_url, is_published, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[cosmetic-badges] liste hatası:', error.message)
    return NextResponse.json({ error: 'Liste alınamadı' }, { status: 500 })
  }

  return NextResponse.json({ badges: (data ?? []) as CosmeticBadgeRow[] })
}

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { resolveAcademyServerSupabaseOrigin } from '@/lib/auth/isolated-test'
import type { CosmeticBadgeRow } from '@/lib/constants/cosmetic-badges'
import type { Database } from '@/types/database.client'

const ipLimiter = createRateLimiter('cosmetic-badges-list-ip', 60, 60_000)

/**
 * GET /api/cosmetic-badges — Yayındaki kozmetik rozetler (public).
 * Mağaza ve profil çeker. Anon key + RLS + is_published filtresi (taslak sızmaz).
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !publicKey) {
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        { badges: [], unavailable: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    console.error('[cosmetic-badges] public Supabase configuration is missing')
    return NextResponse.json({ error: 'Katalog kullanılamıyor' }, { status: 503 })
  }

  const db = createClient<Database>(resolveAcademyServerSupabaseOrigin(url), publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await db
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

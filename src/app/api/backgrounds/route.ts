import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { resolveAcademyServerSupabaseOrigin } from '@/lib/auth/isolated-test'
import type { BackgroundAssetRow } from '@/lib/constants/video-backgrounds'
import type { Database } from '@/types/database.client'

const ipLimiter = createRateLimiter('backgrounds-list-ip', 60, 60_000)

/**
 * GET /api/backgrounds — Yayındaki video temalar (public).
 *
 * Mağaza ve profil bunu çeker. Anon key + RLS policy + is_published filtresi
 * yalnızca yayındaki temaların dönmesini sağlar; service-role gerekmez.
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
        { backgrounds: [], unavailable: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    console.error('[backgrounds] public Supabase configuration is missing')
    return NextResponse.json({ error: 'Katalog kullanılamıyor' }, { status: 503 })
  }

  const db = createClient<Database>(resolveAcademyServerSupabaseOrigin(url), publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await db
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

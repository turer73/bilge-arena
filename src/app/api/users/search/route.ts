import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'

// Enumerasyon korumasi: kullanici-adi/profil taramasini yavaslat (kullanici basi 30/dk).
const searchLimiter = createRateLimiter('users-search', 30, 60_000)

/**
 * GET /api/users/search?q=... — Kullanici arama (arkadas eklemek icin).
 * Accent-insensitive: "ozkan" sorgusu "Özkan" profili bulur (migration 026).
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await searchLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim()

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] })
  }

  const { data } = await supabase.rpc('search_profiles', {
    q: query,
    exclude_id: user.id,
    result_limit: 10,
  })

  return NextResponse.json({ users: data || [] })
}

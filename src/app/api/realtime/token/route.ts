import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { buildRealtimeTokenClaims, signRealtimeToken } from '@/lib/rooms/realtime-token'

const JWT_SECRET = process.env.BILGE_ARENA_REALTIME_JWT_SECRET ?? ''

// Normal kullanim: oda sayfasi acilisinda 1 + ~8 dakikada bir yenileme.
// Oda degistirme/yeniden baglanma payi birakilir; token basimi kotuye
// kullanilamasin diye kullanici basina sinirli.
const tokenLimiter = createRateLimiter('realtime-token', 30, 10 * 60_000)

const NO_STORE = { 'Cache-Control': 'no-store' }

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!JWT_SECRET) {
    return NextResponse.json({ error: 'Realtime not configured' }, { status: 503, headers: NO_STORE })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const limited = await tokenLimiter.check(user.id)
  if (!limited.success) {
    const unavailable = limited.reason === 'backend_unavailable'
    return NextResponse.json(
      { error: unavailable ? 'Rate limit unavailable' : 'Too many requests' },
      {
        status: unavailable ? 503 : 429,
        headers: { ...NO_STORE, 'Retry-After': String(limited.retryAfter ?? 60) },
      },
    )
  }

  const claims = buildRealtimeTokenClaims(user.id)
  const token = signRealtimeToken(claims, JWT_SECRET)

  // Yanit tarayicida onbelleklenmemeli: istemci yenilemede taze token ister.
  return NextResponse.json({ token, expires_at: claims.exp }, { headers: NO_STORE })
}

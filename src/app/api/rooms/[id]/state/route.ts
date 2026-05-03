/**
 * GET /api/rooms/[id]/state — full lobby state hydrate endpoint
 * Sprint 1 PR4b Task 5
 *
 * Reconnect REST resync (memory id=335). Realtime missed event'leri
 * replay etmez, client baglanti dustugunde bu endpoint ile fresh state
 * cekip HYDRATE dispatch eder.
 *
 * Auth: Bearer JWT (cookie session). RLS PostgREST'te otomatik filtrelenir,
 * member degilse rooms[0] yok → null → 404.
 *
 * Response: full RoomState payload (room + members + current_round? +
 * answers_count + scoreboard). online + isStale client-side hook fields.
 */

import { NextResponse } from 'next/server'
import { getAuthRateLimited } from '@/lib/rooms/api-helpers'
import { fetchRoomState } from '@/lib/rooms/server-fetch'
import { createRateLimiter } from '@/lib/utils/rate-limit'

// Reconnect resync + multi-tab heavy — yuksek esikler. 120/dk per user
// = ortalama 2 req/sn, multi-tab + flaky network tolere.
const ipLimiter = createRateLimiter('rooms-state-ip', 480, 60_000)
const userLimiter = createRateLimiter('rooms-state-user', 120, 60_000)

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthRateLimited(req, ipLimiter, userLimiter)
  if (!auth.ok) return auth.response

  const { id } = await params
  const state = await fetchRoomState(auth.jwt, id, auth.userId)
  if (!state) {
    return NextResponse.json(
      { error: 'Oda bulunamadi', code: 'P0002' },
      { status: 404 },
    )
  }

  return NextResponse.json(state)
}

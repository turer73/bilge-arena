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
import { getAuthAndJwt } from '@/lib/rooms/api-helpers'
import { fetchRoomState } from '@/lib/rooms/server-fetch'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthAndJwt()
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

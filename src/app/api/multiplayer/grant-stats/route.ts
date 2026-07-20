/**
 * /api/multiplayer/grant-stats — Faz 3 Multiplayer achievements MVP
 *
 * Oda biter biter frontend bu endpoint'i cagrir. Body:
 *   { roomId: string, isFirstPlace: boolean }
 *
 * RPC `grant_multiplayer_stats` SECURITY DEFINER + idempotency log:
 * aynı oda+user icin sadece 1 kez sayilir. JSONB return ile guncel
 * stats rakamlari geri gelir.
 *
 * Cross-DB notu:
 *   roomId bilge_arena_dev'deki oda code'u (TEXT). Bu endpoint Panola'da
 *   profile guncellemesi yapar; oda DB'sine deger.
 *
 * isFirstPlace SERVER-SIDE dogrulanir (denetim fix):
 *   Client'in gonderdigi isFirstPlace ARTIK KULLANILMAZ. Oda-DB'den
 *   (bilge_arena_dev) kullanici JWT'siyle room.state='completed' + gercek
 *   max-skor okunur (verifyRoomFirstPlace). Sahte birincilik iddiasi engellenir.
 *
 * RPC service-role ile cagrilir (denetim fix, migration 080):
 *   grant_multiplayer_stats artik authenticated'a acik DEGIL — eskiden
 *   auth.uid()+authenticated-grant ile herhangi bir kullanici PostgREST
 *   uzerinden dogrudan (bu route'u atlayarak) rastgele room_id'lerle RPC'yi
 *   cagirip sinirsiz sayac uretebiliyordu. Simdi service_role-only + acik
 *   p_user_id (increment_xp'deki desenle ayni); auth.userId route'ta zaten
 *   JWT+verifyRoomFirstPlace ile dogrulandiktan sonra gecirilir.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getAuthAndJwt } from '@/lib/rooms/api-helpers'
import { verifyRoomFirstPlace } from '@/lib/rooms/server-fetch'

const grantLimiter = createRateLimiter('mp-grant-stats', 20, 60_000)

// isFirstPlace geriye-uyum icin kabul edilir ama YOK SAYILIR (server dogrular).
const BodySchema = z.object({
  roomId: z.string().min(1).max(64),
  isFirstPlace: z.boolean().optional(),
})

export async function POST(req: Request) {
  // Auth + JWT (oda-DB dogrulamasi icin JWT gerekli)
  const auth = await getAuthAndJwt()
  if (!auth.ok) return auth.response

  const rl = await grantLimiter.check(auth.userId)
  if (!rl.success) {
    return NextResponse.json({ error: 'Cok fazla istek' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Gecersiz JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Gecersiz parametre' }, { status: 400 })
  }

  const { roomId } = parsed.data

  // SERVER-SIDE dogrulama: oda-DB'den gercek first-place (client iddiasi yok sayilir)
  const verified = await verifyRoomFirstPlace(auth.jwt, roomId, auth.userId)
  if (!verified.finished) {
    return NextResponse.json({ error: 'Oda tamamlanmamis veya erisilemedi' }, { status: 400 })
  }

  // RPC service-role client ile (migration 080 — authenticated grant kaldirildi,
  // p_user_id auth.userId'den ACIKCA gecirilir; auth.uid() baglilik yok).
  const svc = createServiceRoleClient()
  const { data, error } = await svc.rpc('grant_multiplayer_stats', {
    p_user_id: auth.userId,
    p_room_id: roomId,
    p_first_place: verified.isFirstPlace,
  })

  if (error) {
    console.error('[mp-grant-stats] RPC error:', error.message)
    return NextResponse.json(
      { error: 'Stats guncellenemedi' },
      { status: 500 },
    )
  }

  // Yeni rozet kontrolu icin /api/badges POST'a delegate edebiliriz —
  // ama cyclic call yerine inline check yap (svc role ile).
  // Beta MVP: client zaten /api/badges POST'i ayrica cagiriyor (mevcut
  // pattern). Dolayisi ile burada rozet check skip — frontend GameCompleted
  // grant sonrasi /api/badges POST cagrir.

  return NextResponse.json({ ok: true, stats: data })
}

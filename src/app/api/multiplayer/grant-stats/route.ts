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
 * Beta-only trust:
 *   isFirstPlace frontend'den geliyor. Hardening icin ileride api-dev
 *   scoreboard cross-DB dogrulama yapilabilir (room_members.score order'a
 *   bakar). Beta'da kullanici manipulasyonu sınırlı: ozel rozet, kademeli
 *   acilim. PR followup task.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const grantLimiter = createRateLimiter('mp-grant-stats', 20, 60_000)

const BodySchema = z.object({
  roomId: z.string().min(1).max(64),
  isFirstPlace: z.boolean(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await grantLimiter.check(user.id)
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

  const { roomId, isFirstPlace } = parsed.data

  // RPC service-role uzerinden auth.uid() ile gelir.
  // SECURITY DEFINER + auth.uid() kullaniciya ozgu insert/update.
  // Burada svc client kullanmak yerine kullanici client'i kullaniyoruz
  // ki auth.uid() RPC icinde dogru gelsin. Ancak svc rpc da auth context'i
  // expose eder mi? Hayir — service-role bypass eder ama auth.uid()
  // session-based oldugu icin null olur. user client kullanmaliyiz.
  const { data, error } = await supabase.rpc('grant_multiplayer_stats', {
    p_room_id: roomId,
    p_first_place: isFirstPlace,
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

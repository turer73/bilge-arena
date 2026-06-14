import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { z } from 'zod'
import {
  AVATAR_DECORATIONS,
  getDecorationById,
  isDecorationFree,
} from '@/lib/constants/avatar-decorations'

const ipLimiter = createRateLimiter('decoration-select-ip', 40, 60_000)
const userLimiter = createRateLimiter('decoration-select-user', 30, 60_000)

const selectSchema = z.object({
  // ÇOKLU seçim — boş dizi = süssüz. Katalog boyutuyla sınırlı (abuse guard).
  decorationIds: z.array(z.string().min(1).max(32)).max(AVATAR_DECORATIONS.length),
})

/**
 * POST /api/profile/avatar-decorations/select
 *
 * Seçili süs(ler)i DB'ye yazar (profiles.selected_avatar_decorations text[]).
 * Süsler sıralama/profilde BAŞKALARINA görünür → seçim sunucuda tutulur
 * (localStorage DEĞİL). Her id server-side doğrulanır: ücretsiz (coinCost yok)
 * herkese açık; ücretli ise owned olmalı; personel (RBAC) hepsini ücretsiz
 * kullanır. Tek geçersiz/sahipsiz id → tüm istek reddedilir (kısmi yazma yok).
 */
export async function POST(request: NextRequest) {
  // IP limit ONCE — auth.getUser() Supabase roundtrip'inden önce (anon flood
  // Auth quota'sını tüketmesin; purchase route + leaderboard ile aynı desen).
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await userLimiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Çok hızlı istek' }, { status: 429 })
  }

  const body = await request.json()
  const parsed = selectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'decorationIds dizisi gerekli' }, { status: 400 })
  }

  // Dedup + bilinen id guard (sıra korunur)
  const ids = [...new Set(parsed.data.decorationIds)]
  for (const id of ids) {
    if (!getDecorationById(id)) {
      return NextResponse.json({ error: `Geçersiz süs: ${id}` }, { status: 404 })
    }
  }

  const svc = createServiceRoleClient()

  // Ücretli süsler için sahiplik guard. Personel (RBAC rolü olan) hepsini
  // ücretsiz kullanır → owned sorgusunu atla.
  const paidIds = ids.filter((id) => !isDecorationFree(id))
  if (paidIds.length > 0) {
    const { data: roles } = await svc
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .limit(1)
    const staff = !!(roles && roles.length > 0)
    if (!staff) {
      const { data: prof } = await svc
        .from('profiles')
        .select('owned_avatar_decorations')
        .eq('id', user.id)
        .single()
      const owned = (prof?.owned_avatar_decorations as string[]) ?? []
      const missing = paidIds.filter((id) => !owned.includes(id))
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Bu süslere sahip değilsiniz: ${missing.join(', ')}` },
          { status: 403 },
        )
      }
    }
  }

  const { error } = await svc
    .from('profiles')
    .update({ selected_avatar_decorations: ids })
    .eq('id', user.id)

  if (error) {
    console.error('[DecorationSelect] update hatası:', error.message)
    return NextResponse.json({ error: 'Seçim kaydedilemedi' }, { status: 500 })
  }

  return NextResponse.json({ success: true, selected_avatar_decorations: ids })
}

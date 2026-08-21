import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { z } from 'zod'
import { PROFILE_NAMEPLATES } from '@/lib/constants/profile-nameplates'
import { userHasPlatformAdminAccess } from '@/lib/supabase/platform-access'

const userLimiter = createRateLimiter('nameplate-select-user', 30, 60_000)

const selectSchema = z.object({
  nameplateId: z.string().min(1).max(32),
})

/**
 * POST /api/profile/nameplates/select
 *
 * Seçili nameplate'i DB'ye yazar (profiles.selected_nameplate). Nameplate
 * sıralama/düelloda başkalarına görünür → seçim sunucuda tutulur (localStorage
 * DEĞİL). Sahiplik server-side doğrulanır: ücretli + sahipsiz panel seçilemez
 * (localStorage-bypass'ın DB karşılığı).
 */
export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: 'nameplateId gerekli' }, { status: 400 })
  }
  const { nameplateId } = parsed.data

  const npDef = PROFILE_NAMEPLATES.find((n) => n.id === nameplateId)
  if (!npDef) {
    return NextResponse.json({ error: 'Geçersiz panel' }, { status: 404 })
  }

  const svc = createServiceRoleClient()

  // Sahiplik guard: ücretsiz (coinCost undefined) herkese açık; ücretli ise owned
  // olmalı. İSTİSNA: gerçek platform personeli tüm panelleri ücretsiz kullanır.
  if (npDef.coinCost !== undefined) {
    const staff = await userHasPlatformAdminAccess(svc, user.id)
    if (!staff) {
      const { data: prof } = await svc
        .from('profiles')
        .select('owned_nameplates')
        .eq('id', user.id)
        .single()
      const owned = (prof?.owned_nameplates as string[]) ?? ['none']
      if (!owned.includes(nameplateId)) {
        return NextResponse.json({ error: 'Bu panele sahip değilsiniz' }, { status: 403 })
      }
    }
  }

  const { error } = await svc
    .from('profiles')
    .update({ selected_nameplate: nameplateId })
    .eq('id', user.id)

  if (error) {
    console.error('[NameplateSelect] update hatası:', error.message)
    return NextResponse.json({ error: 'Seçim kaydedilemedi' }, { status: 500 })
  }

  return NextResponse.json({ success: true, selected_nameplate: nameplateId })
}

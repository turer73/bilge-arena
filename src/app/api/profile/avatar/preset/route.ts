import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { presetAvatarPath } from '@/lib/constants/preset-avatars'

const limiter = createRateLimiter('avatar-preset', 20, 60_000)
const schema = z.object({ presetId: z.string().min(1).max(64) })

/**
 * POST /api/profile/avatar/preset — Küratörlü hazır-avatar setinden seçim.
 *
 * GÜVENLİK: yalnızca BİLİNEN preset-id kabul edilir → statik /public path'ine
 * eşlenir. İstemciden gelen rastgele avatar_url ASLA kabul edilmez (harici NSFW
 * URL enjeksiyonu önlenir). Serbest foto yükleme kaldırıldığı için güvenli
 * alternatif budur. Presetler ücretsiz (avatar = kimlik, paywall değil).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await limiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Çok hızlı istek' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'presetId gerekli' }, { status: 400 })
  }

  // Sadece bilinen preset → statik path. Bilinmiyorsa reddet (URL enjeksiyon guard).
  const path = presetAvatarPath(parsed.data.presetId)
  if (!path) {
    return NextResponse.json({ error: 'Geçersiz avatar' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { error } = await admin.from('profiles').update({ avatar_url: path }).eq('id', user.id)
  if (error) {
    console.error('[avatar/preset] update hatası:', error.code)
    return NextResponse.json({ error: 'Avatar güncellenemedi' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: path })
}

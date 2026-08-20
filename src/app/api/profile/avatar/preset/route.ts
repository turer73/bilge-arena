import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { avatarPath, avatarMinLevel } from '@/lib/constants/avatars'
import { getLevelFromXP } from '@/lib/constants/levels'
import { userHasPlatformAdminAccess } from '@/lib/supabase/platform-access'

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

  // Sadece bilinen avatar id → statik path (mascot webp + DiceBear svg).
  // Bilinmiyorsa reddet (rastgele URL enjeksiyon guard).
  const path = avatarPath(parsed.data.presetId)
  if (!path) {
    return NextResponse.json({ error: 'Geçersiz avatar' }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  // Rarity — seviye kilidi. Gerekli seviye > 1 ise kullanıcının seviyesini
  // (total_xp'den) doğrula. Yalnız platform personeli tüm avatarları açar;
  // kurum/öğretmen pilot rolleri bu ayrıcalığı vermez.
  const minLevel = avatarMinLevel(parsed.data.presetId)
  if (minLevel > 1) {
    const staff = await userHasPlatformAdminAccess(admin, user.id)
    if (!staff) {
      const { data: prof } = await admin
        .from('profiles')
        .select('total_xp')
        .eq('id', user.id)
        .single()
      if (getLevelFromXP(prof?.total_xp ?? 0).level < minLevel) {
        return NextResponse.json({ error: `Seviye ${minLevel} gerekli` }, { status: 403 })
      }
    }
  }

  const { error } = await admin.from('profiles').update({ avatar_url: path }).eq('id', user.id)
  if (error) {
    console.error('[avatar/preset] update hatası:', error.code)
    return NextResponse.json({ error: 'Avatar güncellenemedi' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: path })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'avatars'

/**
 * DELETE /api/profile/avatar — Kullanıcının özel avatarını kaldırır
 * (Google fotoğrafı / baş-harf fallback'ine döner).
 *
 * GÜVENLİK NOTU: Serbest foto YÜKLEME (eski POST) bilinçli olarak KALDIRILDI.
 * Reşit-olmayan kullanıcı tabanında denetimsiz görsel yükleme cinsel-içerik /
 * CSAM riski taşıyordu (içerik moderasyonu yoktu; magic-bytes yalnız "görsel mi"
 * der, içeriğe bakmaz). Avatar artık Google fotoğrafından gelir veya küratörlü
 * hazır-avatar setinden seçilir; kullanıcı serbest görsel yükleyemez.
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const admin = createServiceRoleClient()

  // Daha önce yüklenmiş özel avatar dosyalarını temizle (varsa)
  await admin.storage.from(BUCKET).remove([
    `${user.id}/avatar.jpg`,
    `${user.id}/avatar.png`,
    `${user.id}/avatar.webp`,
  ])

  await admin.from('profiles').update({ avatar_url: null }).eq('id', user.id)

  return NextResponse.json({ success: true })
}

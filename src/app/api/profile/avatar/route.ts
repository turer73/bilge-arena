import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const avatarLimiter = createRateLimiter('avatar-upload', 5, 60_000)
const MAX_SIZE = 1 * 1024 * 1024 // 1MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png']
const BUCKET = 'avatars'

// Magic bytes kontrolu — dosya uzantisina guvenme
function detectMimeType(buffer: Uint8Array): string | null {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp'
  return null
}

/**
 * POST /api/profile/avatar — Avatar yukle
 * FormData: file (image, max 1MB)
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await avatarLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Dosya en fazla 1MB olmali' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Sadece JPEG, PNG ve WebP desteklenir' }, { status: 400 })
  }

  // Magic bytes kontrolu
  const buffer = new Uint8Array(await file.arrayBuffer())
  const detectedType = detectMimeType(buffer)
  if (!detectedType || !ALLOWED_TYPES.includes(detectedType)) {
    return NextResponse.json({ error: 'Gecersiz dosya formati' }, { status: 400 })
  }

  const ext = detectedType.split('/')[1] === 'jpeg' ? 'jpg' : 'png'
  const filePath = `${user.id}/avatar.${ext}`

  // Service role client — RLS bypass
  const admin = createServiceRoleClient()

  // Eski avatari sil (farkli uzanti olabilir)
  await admin.storage.from(BUCKET).remove([
    `${user.id}/avatar.jpg`,
    `${user.id}/avatar.png`,
  ])

  // Yeni avatari yukle
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: detectedType,
      upsert: true,
    })

  if (uploadError) {
    console.error('[Avatar] Upload hatasi:', uploadError)
    return NextResponse.json({ error: 'Avatar yuklenemedi: ' + uploadError.message }, { status: 500 })
  }

  // Public URL al
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(filePath)
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

  // Profili guncelle
  const { error: updateError } = await admin
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id)

  if (updateError) {
    console.error('[Avatar] Profile update hatasi:', updateError)
    return NextResponse.json({ error: 'Profil guncellenemedi' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: avatarUrl })
}

/**
 * DELETE /api/profile/avatar — Avatari kaldir
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const admin = createServiceRoleClient()

  // Tum olasi dosyalari sil
  await admin.storage.from(BUCKET).remove([
    `${user.id}/avatar.jpg`,
    `${user.id}/avatar.png`,
  ])

  // Profili guncelle
  await admin
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id)

  return NextResponse.json({ success: true })
}

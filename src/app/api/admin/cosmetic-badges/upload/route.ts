import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { detectImageMime } from '@/lib/utils/security'

const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const BUCKET = 'badge-assets'
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * POST /api/admin/cosmetic-badges/upload — rozet görseli yükle.
 * FormData: file, slug. Magic-bytes (PNG/JPEG/WebP), 2MB cap, service-role
 * upload (badge-assets bucket) + getPublicUrl. Avatar/homepage upload deseni.
 * LİSANS: görsel telifi yükleyene aittir (UI uyarısı).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.badges.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rlRes = await checkAdminMutationRl(admin.id, 'upload')
  if (rlRes) return rlRes

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const slug = ((formData.get('slug') as string | null) ?? '').trim()

  if (!file) {
    return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 })
  }
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
    return NextResponse.json({ error: 'Geçersiz slug' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Görsel en fazla 2MB olmalı' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const detected = detectImageMime(buffer)
  if (!detected) {
    return NextResponse.json({ error: 'Geçersiz görsel (PNG/JPEG/WebP)' }, { status: 400 })
  }
  const ext = IMAGE_EXT[detected]

  const svc = createServiceRoleClient()
  const filePath = `${slug}/icon.${ext}`

  // Eski uzantıları temizle
  await svc.storage.from(BUCKET).remove(['png', 'jpg', 'webp'].map((e) => `${slug}/icon.${e}`))

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: detected, upsert: true })

  if (upErr) {
    console.error('[admin/cosmetic-badges/upload] hata:', upErr.message)
    return NextResponse.json({ error: 'Yükleme başarısız' }, { status: 500 })
  }

  const { data: urlData } = svc.storage.from(BUCKET).getPublicUrl(filePath)
  const url = `${urlData.publicUrl}?t=${Date.now()}`

  return NextResponse.json({ url, contentType: detected })
}

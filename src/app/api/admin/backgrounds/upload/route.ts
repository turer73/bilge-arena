import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { detectVideoMime, detectImageMime } from '@/lib/utils/security'

const MAX_VIDEO = 8 * 1024 * 1024 // 8 MB
const MAX_POSTER = 2 * 1024 * 1024 // 2 MB
const BUCKET = 'video-backgrounds'

const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm' }
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const VARIANT_KINDS = ['hd', 'k2', 'k4', 'poster'] as const
type VariantKind = (typeof VARIANT_KINDS)[number]

/**
 * POST /api/admin/backgrounds/upload — Video/poster dosyası yükle.
 *
 * FormData: file, slug ([a-z0-9-]), kind (hd|k2|k4|poster).
 * Magic-bytes doğrulaması (MIME'a güvenmez), 8MB video / 2MB poster cap.
 * Yalnızca public URL döner; URL'i background_assets'e bağlamak ayrı CRUD
 * çağrısıdır (avatar deseni: service-role upload + getPublicUrl).
 *
 * LİSANS: yüklenen içeriğin telif sorumluluğu yükleyene aittir (UI uyarısı).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.backgrounds.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rlRes = await checkAdminMutationRl(admin.id, 'upload')
  if (rlRes) return rlRes

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const slug = ((formData.get('slug') as string | null) ?? '').trim()
  const kind = ((formData.get('kind') as string | null) ?? '') as VariantKind

  if (!file) {
    return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 })
  }
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
    return NextResponse.json({ error: 'Geçersiz slug' }, { status: 400 })
  }
  if (!VARIANT_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Geçersiz varyant (hd|k2|k4|poster)' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const isPoster = kind === 'poster'

  let contentType: string
  let ext: string
  if (isPoster) {
    if (file.size > MAX_POSTER) {
      return NextResponse.json({ error: 'Poster en fazla 2MB olmalı' }, { status: 400 })
    }
    const detected = detectImageMime(buffer)
    if (!detected) {
      return NextResponse.json({ error: 'Geçersiz görsel (PNG/JPEG/WebP)' }, { status: 400 })
    }
    contentType = detected
    ext = IMAGE_EXT[detected]
  } else {
    if (file.size > MAX_VIDEO) {
      return NextResponse.json({ error: 'Video en fazla 8MB olmalı' }, { status: 400 })
    }
    const detected = detectVideoMime(buffer)
    if (!detected) {
      return NextResponse.json({ error: 'Geçersiz video (MP4/WebM)' }, { status: 400 })
    }
    contentType = detected
    ext = VIDEO_EXT[detected]
  }

  const svc = createServiceRoleClient()
  const filePath = `${slug}/${kind}.${ext}`

  // Aynı varyantın farklı uzantılı eski sürümlerini temizle
  const cleanupExts = isPoster ? ['png', 'jpg', 'webp'] : ['mp4', 'webm']
  await svc.storage.from(BUCKET).remove(cleanupExts.map((e) => `${slug}/${kind}.${e}`))

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType, upsert: true })

  if (upErr) {
    console.error('[admin/backgrounds/upload] hata:', upErr.message)
    return NextResponse.json({ error: 'Yükleme başarısız' }, { status: 500 })
  }

  const { data: urlData } = svc.storage.from(BUCKET).getPublicUrl(filePath)
  const url = `${urlData.publicUrl}?t=${Date.now()}`

  return NextResponse.json({ url, kind, contentType })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import { isPngBuffer } from '@/lib/utils/security'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME = 'image/png'

/**
 * POST /api/admin/homepage/upload
 * Gorsel yukle (sadece PNG, max 2MB).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.homepage.edit')
    if (!admin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Dosya boyutu 2MB\'dan büyük olamaz' },
        { status: 400 }
      )
    }

    // Magic bytes kontrolü — client MIME type'ına güvenme
    const buffer = await file.arrayBuffer()
    if (!isPngBuffer(buffer)) {
      return NextResponse.json(
        { error: 'Geçersiz dosya formatı. Sadece PNG kabul edilir.' },
        { status: 400 }
      )
    }

    // Dosya adini temizle
    const sanitizedFilename = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.')

    const filePath = `logos/${Date.now()}-${sanitizedFilename}.png`

    const uploadBuffer = new Uint8Array(buffer)

    const { error: uploadError } = await supabase.storage
      .from('homepage-assets')
      .upload(filePath, buffer, {
        contentType: ALLOWED_MIME,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('homepage-assets')
      .getPublicUrl(filePath)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

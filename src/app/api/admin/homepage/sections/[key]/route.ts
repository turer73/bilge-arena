import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import { homepageSectionUpdateSchema } from '@/lib/validations/schemas'

/**
 * PATCH /api/admin/homepage/sections/[key]
 * Section config JSONB guncelle.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.homepage.edit')
    if (!admin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const { key } = await params
    const body = await request.json()
    const parsed = homepageSectionUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz config verisi' }, { status: 400 })
    }
    const { config } = parsed.data

    const { error } = await supabase
      .from('homepage_sections')
      .update({ config, updated_by: admin.id })
      .eq('key', key)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

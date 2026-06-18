import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
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

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

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
      return dbErrorResponse('admin/homepage/sections/[key]', error)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { homepageSectionUpdateSchema } from '@/lib/validations/schemas'
import type { Json } from '@/types/database.generated'

function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(isJson)
  }

  if (typeof value === 'object') {
    return Object.values(value).every((entry) => entry === undefined || isJson(entry))
  }

  return false
}

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

    if (!isJson(config)) {
      return NextResponse.json({ error: 'Config gecerli JSON olmalidir' }, { status: 400 })
    }

    const { error } = await supabase
      .from('homepage_sections')
      .update({ config, updated_by: admin.id })
      // Sutun adi 'section_key' (migration 017). Eskiden 'key' yaziyordu ve
      // PostgREST "column does not exist" dondugu icin bu endpoint hic
      // calismiyordu; supabase-js tip sikilastirmasi ortaya cikardi.
      .eq('section_key', key)

    if (error) {
      return dbErrorResponse('admin/homepage/sections/[key]', error)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

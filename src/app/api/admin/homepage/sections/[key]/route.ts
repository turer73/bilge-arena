import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import {
  homepageSectionKeySchema,
  homepageSectionUpdateSchema,
} from '@/lib/validations/schemas'
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

    const key = homepageSectionKeySchema.safeParse((await params).key)
    if (!key.success) {
      return NextResponse.json({ error: 'Geçersiz bölüm anahtarı' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
    }
    const parsed = homepageSectionUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz config verisi' }, { status: 400 })
    }
    const { config, requestId } = parsed.data

    if (!isJson(config)) {
      return NextResponse.json({ error: 'Config gecerli JSON olmalidir' }, { status: 400 })
    }

    const { data, error } = await createServiceRoleClient().rpc('mutate_admin_homepage', {
      p_user_id: admin.id,
      p_request_id: requestId,
      p_operation: 'section_update',
      p_payload: { sectionKey: key.data, config },
    })

    if (error) {
      return dbErrorResponse('admin/homepage/sections/[key]', error)
    }

    const result = data && typeof data === 'object' && !Array.isArray(data) ? data : null
    if (!result || result.success !== true) {
      return NextResponse.json({ error: 'Bölüm sonucu doğrulanamadı' }, { status: 500 })
    }

    return NextResponse.json({ success: true, replayed: result.replayed === true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

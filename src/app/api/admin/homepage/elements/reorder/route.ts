import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { homepageReorderSchema } from '@/lib/validations/schemas'

/**
 * PATCH /api/admin/homepage/elements/reorder
 * Toplu sort_order guncelle.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.homepage.edit')
    if (!admin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
    }
    const parsed = homepageReorderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'section_key ve ordered_ids (dizi) zorunludur' },
        { status: 400 }
      )
    }
    const { requestId, section_key, ordered_ids } = parsed.data

    const { data, error } = await createServiceRoleClient().rpc('mutate_admin_homepage', {
      p_user_id: admin.id,
      p_request_id: requestId,
      p_operation: 'elements_reorder',
      p_payload: { sectionKey: section_key, orderedIds: ordered_ids },
    })

    if (error) {
      return dbErrorResponse('admin/homepage/elements/reorder', error)
    }

    const result = data && typeof data === 'object' && !Array.isArray(data) ? data : null
    if (!result || result.success !== true || result.reorderedElements !== ordered_ids.length) {
      return NextResponse.json({ error: 'Sıralama sonucu doğrulanamadı' }, { status: 500 })
    }

    return NextResponse.json({ success: true, replayed: result.replayed === true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

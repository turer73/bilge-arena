import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { revalidatePath } from 'next/cache'
import { homepagePublishSchema } from '@/lib/validations/schemas'

/**
 * POST /api/admin/homepage/publish
 * Toplu publish/unpublish islemi.
 */
export async function POST(request: NextRequest) {
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
    const parsed = homepagePublishSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'action "publish" veya "unpublish" olmalıdır' },
        { status: 400 }
      )
    }
    const { requestId, action, section_keys, element_ids } = parsed.data
    // Yalniz {action,requestId}: butun ana sayfa. Herhangi bir hedef listesi:
    // yalniz secim. Zod bos listeyi reddeder, dolayisiyla sessiz no-op yoktur.
    const scope = section_keys === undefined && element_ids === undefined
      ? 'all'
      : 'selection'

    const { data, error } = await createServiceRoleClient().rpc('mutate_admin_homepage', {
      p_user_id: admin.id,
      p_request_id: requestId,
      p_operation: 'publish',
      p_payload: {
        action,
        scope,
        sectionKeys: section_keys ?? [],
        elementIds: element_ids ?? [],
      },
    })

    if (error) {
      return dbErrorResponse('admin/homepage/publish', error)
    }

    const result = data && typeof data === 'object' && !Array.isArray(data) ? data : null
    const publishedSections = result?.sectionsChanged
    const publishedElements = result?.elementsChanged
    if (
      !result
      || result.success !== true
      || typeof publishedSections !== 'number'
      || typeof publishedElements !== 'number'
    ) {
      return NextResponse.json({ error: 'Yayın sonucu doğrulanamadı' }, { status: 500 })
    }

    // ISR cache'i temizle
    revalidatePath('/')

    return NextResponse.json({
      success: true,
      published_sections: publishedSections,
      published_elements: publishedElements,
      scope,
      replayed: result.replayed === true,
    })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

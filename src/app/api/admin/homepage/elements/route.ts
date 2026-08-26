import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { homepageElementCreateSchema } from '@/lib/validations/schemas'
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
 * GET /api/admin/homepage/elements
 * Tum homepage element'lerini getir. ?section=xxx ile filtrelenebilir.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.homepage.view')
    if (!admin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section')

    let query = supabase
      .from('homepage_elements')
      .select('*')
      .order('sort_order', { ascending: true })

    if (section) {
      query = query.eq('section_key', section)
    }

    const { data: elements, error } = await query

    if (error) {
      return dbErrorResponse('admin/homepage/elements', error)
    }

    return NextResponse.json({ elements: elements ?? [] })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

/**
 * POST /api/admin/homepage/elements
 * Yeni element olustur.
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
    const parsed = homepageElementCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'section_key ve element_type zorunludur' },
        { status: 400 }
      )
    }
    const {
      requestId,
      section_key,
      element_type,
      content,
      image_url,
      alt_text,
      placement,
      alignment,
      size,
      styles,
    } = parsed.data

    if (styles != null && !isJson(styles)) {
      return NextResponse.json({ error: 'styles gecerli JSON olmalidir' }, { status: 400 })
    }

    const svc = createServiceRoleClient()
    const { data, error } = await svc.rpc('mutate_admin_homepage', {
      p_user_id: admin.id,
      p_request_id: requestId,
      p_operation: 'element_create',
      p_payload: {
        sectionKey: section_key,
        elementType: element_type,
        content: content ?? null,
        imageUrl: image_url ?? null,
        altText: alt_text ?? '',
        placement: placement ?? 'below',
        alignment: alignment ?? 'center',
        size: size ?? 'md',
        styles: (styles ?? {}) as Json,
      },
    })

    if (error) {
      return dbErrorResponse('admin/homepage/elements', error)
    }

    const result = data && typeof data === 'object' && !Array.isArray(data) ? data : null
    const element = result?.element
    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      return NextResponse.json({ error: 'Öğe sonucu doğrulanamadı' }, { status: 500 })
    }

    return NextResponse.json({ element, replayed: result?.replayed === true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

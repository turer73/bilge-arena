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

    const body = await request.json()
    const parsed = homepageElementCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'section_key ve element_type zorunludur' },
        { status: 400 }
      )
    }
    const {
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

    if (content != null && typeof content !== 'string') {
      return NextResponse.json({ error: 'content metin olmalidir' }, { status: 400 })
    }

    if (styles != null && !isJson(styles)) {
      return NextResponse.json({ error: 'styles gecerli JSON olmalidir' }, { status: 400 })
    }

    const svc = createServiceRoleClient()
    const { data: element, error } = await svc
      .from('homepage_elements')
      .insert({
        section_key,
        element_type,
        content: content ?? null,
        image_url: image_url ?? null,
        alt_text: alt_text ?? undefined,
        placement: placement ?? undefined,
        alignment: alignment ?? undefined,
        size: size ?? undefined,
        styles: styles ?? undefined,
        created_by: admin.id,
      })
      .select()
      .single()

    if (error) {
      return dbErrorResponse('admin/homepage/elements', error)
    }

    // Admin log
    await svc.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'create_homepage_element',
      target_type: 'homepage_element',
      target_id: element.id,
      details: { section_key, element_type },
    })

    return NextResponse.json({ element })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

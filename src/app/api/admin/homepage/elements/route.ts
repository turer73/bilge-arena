import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'

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
      return NextResponse.json({ error: error.message }, { status: 500 })
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

    const body = await request.json()
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
    } = body

    if (!section_key || !element_type) {
      return NextResponse.json(
        { error: 'section_key ve element_type zorunludur' },
        { status: 400 }
      )
    }

    const svc = createServiceRoleClient()
    const { data: element, error } = await svc
      .from('homepage_elements')
      .insert({
        section_key,
        element_type,
        content: content ?? null,
        image_url: image_url ?? null,
        alt_text: alt_text ?? null,
        placement: placement ?? null,
        alignment: alignment ?? null,
        size: size ?? null,
        styles: styles ?? null,
        created_by: admin.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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

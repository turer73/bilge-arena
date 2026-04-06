import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'

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

    const body = await request.json()
    const { section_key, ordered_ids } = body

    if (!section_key || !Array.isArray(ordered_ids) || ordered_ids.length === 0) {
      return NextResponse.json(
        { error: 'section_key ve ordered_ids (dizi) zorunludur' },
        { status: 400 }
      )
    }

    // Her element icin sort_order guncelle
    const updates = ordered_ids.map((id: string, index: number) =>
      supabase
        .from('homepage_elements')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('section_key', section_key)
    )

    await Promise.all(updates)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

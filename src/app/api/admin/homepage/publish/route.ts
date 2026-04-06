import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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

    const body = await request.json()
    const { action, section_keys, element_ids } = body

    if (action !== 'publish' && action !== 'unpublish') {
      return NextResponse.json(
        { error: 'action "publish" veya "unpublish" olmalıdır' },
        { status: 400 }
      )
    }

    const isPublished = action === 'publish'
    let publishedSections = 0
    let publishedElements = 0

    // Section'lari guncelle
    if (Array.isArray(section_keys) && section_keys.length > 0) {
      const { count } = await supabase
        .from('homepage_sections')
        .update({ is_published: isPublished })
        .in('key', section_keys)

      publishedSections = count ?? 0
    }

    // Element'leri guncelle
    if (Array.isArray(element_ids) && element_ids.length > 0) {
      const { count } = await supabase
        .from('homepage_elements')
        .update({ is_published: isPublished })
        .in('id', element_ids)

      publishedElements = count ?? 0
    }

    // ISR cache'i temizle
    revalidatePath('/')

    return NextResponse.json({
      success: true,
      published_sections: publishedSections,
      published_elements: publishedElements,
    })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

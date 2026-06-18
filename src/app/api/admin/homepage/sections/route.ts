import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'

/**
 * GET /api/admin/homepage/sections
 * Tum homepage section'larini getir.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.homepage.view')
    if (!admin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const { data: sections, error } = await supabase
      .from('homepage_sections')
      .select('*')
      .order('section_key', { ascending: true })

    if (error) {
      return dbErrorResponse('admin/homepage/sections', error)
    }

    return NextResponse.json({ sections: sections ?? [] })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

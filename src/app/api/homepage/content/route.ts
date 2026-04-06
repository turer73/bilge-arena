import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ISR: 60 saniyede bir yeniden dogrula
export const revalidate = 60

/**
 * GET /api/homepage/content
 * Yayinlanmis section ve element'leri getir (public, auth gerektirmez).
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Yayinlanmis section'lari getir
    const { data: sectionsData, error: sectionsError } = await supabase
      .from('homepage_sections')
      .select('*')
      .eq('is_published', true)

    if (sectionsError) {
      return NextResponse.json({ error: sectionsError.message }, { status: 500 })
    }

    // Yayinlanmis element'leri getir
    const { data: elementsData, error: elementsError } = await supabase
      .from('homepage_elements')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })

    if (elementsError) {
      return NextResponse.json({ error: elementsError.message }, { status: 500 })
    }

    // Section'lari section_key -> config map'e cevir
    const sections: Record<string, unknown> = {}
    for (const s of sectionsData ?? []) {
      sections[s.section_key] = s.config
    }

    // Element'leri section_key'e gore grupla
    const elements: Record<string, unknown[]> = {}
    for (const el of elementsData ?? []) {
      if (!elements[el.section_key]) {
        elements[el.section_key] = []
      }
      elements[el.section_key].push(el)
    }

    return NextResponse.json({ sections, elements })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

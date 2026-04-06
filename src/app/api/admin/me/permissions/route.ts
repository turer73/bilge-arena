import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserPermissions, getUserRoles } from '@/lib/supabase/admin'

/**
 * GET /api/admin/me/permissions
 * Giriş yapan admin kullanıcısının tüm izinlerini ve rollerini döner.
 * Admin sidebar filtreleme için kullanılır.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 })
    }

    const [permissions, roles] = await Promise.all([
      getUserPermissions(supabase, user.id),
      getUserRoles(supabase, user.id),
    ])

    if (roles.length === 0) {
      return NextResponse.json({ error: 'Admin yetkisi bulunamadı' }, { status: 403 })
    }

    return NextResponse.json({
      permissions,
      roles: roles.map(r => ({ slug: r.slug, name: r.name })),
    })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

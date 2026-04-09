import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'

/**
 * GET /api/admin/roles
 * Tüm rolleri, izinleriyle ve kullanıcı sayısıyla birlikte döner.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.roles.view')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    // Roller
    const { data: roles } = await supabase
      .from('roles')
      .select('*')
      .order('created_at')

    if (!roles) return NextResponse.json({ roles: [] })

    // Her rolün izinleri
    const { data: allPermissions } = await supabase
      .from('role_permissions')
      .select('role_id, permission')

    // Her rolün kullanıcı sayısı
    const { data: userCounts } = await supabase
      .from('user_roles')
      .select('role_id')

    const permsByRole = new Map<string, string[]>()
    allPermissions?.forEach(p => {
      const existing = permsByRole.get(p.role_id) || []
      existing.push(p.permission)
      permsByRole.set(p.role_id, existing)
    })

    const countByRole = new Map<string, number>()
    userCounts?.forEach(ur => {
      countByRole.set(ur.role_id, (countByRole.get(ur.role_id) || 0) + 1)
    })

    const enriched = roles.map(r => ({
      ...r,
      permissions: permsByRole.get(r.id) || [],
      user_count: countByRole.get(r.id) || 0,
    }))

    return NextResponse.json({ roles: enriched })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

/**
 * POST /api/admin/roles
 * Yeni rol oluştur.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const body = await request.json()
    const { name, slug, description, permissions } = body

    if (!name || !slug) {
      return NextResponse.json({ error: 'İsim ve slug zorunlu' }, { status: 400 })
    }

    // Slug format kontrolü
    if (!/^[a-z0-9_]+$/.test(slug)) {
      return NextResponse.json({ error: 'Slug sadece küçük harf, rakam ve alt çizgi içerebilir' }, { status: 400 })
    }

    // Rol oluştur
    const svc = createServiceRoleClient()
    const { data: role, error } = await svc
      .from('roles')
      .insert({ name, slug, description: description || null, is_system: false })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bu slug zaten kullanılıyor' }, { status: 409 })
      }
      throw error
    }

    // İzinleri ekle
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const permRows = permissions.map((p: string) => ({
        role_id: role.id,
        permission: p,
      }))
      await svc.from('role_permissions').insert(permRows)
    }

    // Admin log
    await svc.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'create_role',
      target_type: 'role',
      target_id: role.id,
      details: { name, slug, permissions },
    })

    return NextResponse.json({ role }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

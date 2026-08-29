import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { roleCreateSchema } from '@/lib/validations/schemas'
import { adminRbacErrorResponse, callAdminRbacRpc } from '@/lib/admin-rbac/mutations'

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

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    const body = await request.json().catch(() => null)
    const parsed = roleCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz rol bilgisi' }, { status: 400 })
    }
    const { name, slug, description, permissions, requestId } = parsed.data

    const svc = createServiceRoleClient()
    const { data, error } = await callAdminRbacRpc(svc, 'admin_create_role', {
      p_actor_id: admin.id,
      p_request_id: requestId,
      p_payload: { name, slug, description: description ?? null, permissions },
    })
    if (error) return adminRbacErrorResponse(error)

    const role = (data as { role?: unknown } | null)?.role
    if (!role) return NextResponse.json({ error: 'Rol işlemi tamamlanamadı' }, { status: 500 })
    return NextResponse.json({ role }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

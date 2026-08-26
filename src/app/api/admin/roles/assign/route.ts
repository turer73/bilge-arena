import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { roleAssignSchema } from '@/lib/validations/schemas'
import { adminRbacErrorResponse, callAdminRbacRpc } from '@/lib/admin-rbac/mutations'

/**
 * POST /api/admin/roles/assign
 * Kullanıcıya rol ata.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieClient = await createClient()
    const admin = await checkPermission(cookieClient, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    const body = await request.json().catch(() => null)
    const parsed = roleAssignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz rol atama isteği' }, { status: 400 })
    }
    const { userId, roleId, requestId } = parsed.data

    const svc = createServiceRoleClient()
    const { error } = await callAdminRbacRpc(svc, 'admin_assign_role', {
      p_actor_id: admin.id,
      p_user_id: userId,
      p_role_id: roleId,
      p_request_id: requestId,
    })
    if (error) return adminRbacErrorResponse(error)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/roles/assign
 * Kullanıcıdan rol kaldır.
 */
export async function DELETE(request: NextRequest) {
  try {
    const cookieClient = await createClient()
    const admin = await checkPermission(cookieClient, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    const body = await request.json().catch(() => null)
    const parsed = roleAssignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz rol kaldırma isteği' }, { status: 400 })
    }
    const { userId, roleId, requestId } = parsed.data

    const svc = createServiceRoleClient()
    const { error } = await callAdminRbacRpc(svc, 'admin_revoke_role', {
      p_actor_id: admin.id,
      p_user_id: userId,
      p_role_id: roleId,
      p_request_id: requestId,
    })
    if (error) return adminRbacErrorResponse(error)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

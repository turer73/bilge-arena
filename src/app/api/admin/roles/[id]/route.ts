import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { roleUpdateSchema } from '@/lib/validations/schemas'
import { adminRbacErrorResponse, callAdminRbacRpc } from '@/lib/admin-rbac/mutations'
import { z } from 'zod'

const roleIdSchema = z.string().uuid()

/**
 * PATCH /api/admin/roles/[id]
 * Rol güncelle (isim, açıklama, izinler).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    const id = roleIdSchema.safeParse((await params).id)
    if (!id.success) {
      return NextResponse.json({ error: 'Geçersiz rol kimliği' }, { status: 400 })
    }
    const body = await request.json().catch(() => null)
    const parsed = roleUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Guncellenecek alan yok' }, { status: 400 })
    }
    const { name, description, permissions, requestId } = parsed.data
    const payload: Record<string, unknown> = {}
    if (name !== undefined) payload.name = name
    if (description !== undefined) payload.description = description
    if (permissions !== undefined) payload.permissions = permissions

    const svc = createServiceRoleClient()
    const { error } = await callAdminRbacRpc(svc, 'admin_update_role', {
      p_actor_id: admin.id,
      p_role_id: id.data,
      p_request_id: requestId,
      p_payload: payload,
    })
    if (error) return adminRbacErrorResponse(error)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/roles/[id]
 * Sistem rolü olmayan rolleri sil.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    const id = roleIdSchema.safeParse((await params).id)
    if (!id.success) {
      return NextResponse.json({ error: 'Geçersiz rol kimliği' }, { status: 400 })
    }
    const requestId = request.headers.get('x-request-id')
    if (!z.string().uuid().safeParse(requestId).success) {
      return NextResponse.json({ error: 'Geçersiz istek kimliği' }, { status: 400 })
    }
    const svc = createServiceRoleClient()
    const { error } = await callAdminRbacRpc(svc, 'admin_delete_role', {
      p_actor_id: admin.id,
      p_role_id: id.data,
      p_request_id: requestId,
    })
    if (error) return adminRbacErrorResponse(error)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

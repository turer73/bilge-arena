import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission, logAdminAction } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database.generated'
import { z } from 'zod'
import { adminRbacErrorResponse, callAdminRbacRpc } from '@/lib/admin-rbac/mutations'

type SearchProfilesAdminArgs = Database['public']['Functions']['search_profiles_admin']['Args']

const adminUserLimiter = createRateLimiter('admin-users-create', 10, 60_000) // 10/dk

const adminInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().max(100).optional(),
  roleId: z.string().uuid().optional(),
  requestId: z.string().uuid(),
}).strict()

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.users.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const rawPage = parseInt(searchParams.get('page') ?? '1')
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, 1000)
  const search = searchParams.get('search') ?? ''
  const limit = 20
  const offset = (page - 1) * limit

  // Accent-insensitive arama: "ozkan" -> "Özkan" (migration 026 RPC)
  // total_count pencere fonksiyonu ile RPC icinden geliyor.
  const searchArgs: SearchProfilesAdminArgs = {
    result_offset: offset,
    result_limit: limit,
  }
  if (search) searchArgs.q = search

  const { data: rows } = await supabase.rpc('search_profiles_admin', searchArgs)

  const rawRows = (rows ?? []) as Array<{ id: string; total_count: number | string } & Record<string, unknown>>
  const users: Array<{ id: string } & Record<string, unknown>> = rawRows.map(({ total_count: _tc, ...rest }) => rest)
  const count = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0

  // RBAC: Her kullanıcının atanmış rollerini de getir
  let usersWithRoles: Array<Record<string, unknown>> = users
  if (users.length > 0) {
    const userIds = users.map(u => u.id)
    const { data: allUserRoles } = await supabase
      .from('user_roles')
      .select('user_id, role_id, roles:role_id(slug, name)')
      .in('user_id', userIds)

    if (allUserRoles) {
      const rolesByUser = new Map<string, { role_id: string; role_slug: string; role_name: string }[]>()
      allUserRoles.forEach((ur: Record<string, unknown>) => {
        const userId = ur.user_id as string
        const role = ur.roles as { slug: string; name: string } | null
        if (!role) return
        const existing = rolesByUser.get(userId) || []
        existing.push({
          role_id: ur.role_id as string,
          role_slug: role.slug,
          role_name: role.name,
        })
        rolesByUser.set(userId, existing)
      })

      usersWithRoles = users.map(u => ({
        ...u,
        assigned_roles: rolesByUser.get(u.id) || [],
      }))
    }
  }

  return NextResponse.json({ users: usersWithRoles, total: count, page, limit })
}

export async function PATCH(_request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.users.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  // profiles.role was the pre-RBAC authorization source. Mutating it here
  // would create two competing sources of truth and the browser client no
  // longer has profile UPDATE privileges. Role changes must use the governed
  // /api/admin/roles/assign RPC path.
  return NextResponse.json(
    { error: 'Eski profil rolü mutasyonu kapatıldı; RBAC rol yönetimini kullanın' },
    { status: 405, headers: { Allow: 'GET, POST' } },
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.users.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  // Rate limit — admin başına 10 kullanıcı/dakika
  const rl = await adminUserLimiter.check(admin.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Çok fazla istek. Lütfen bekleyin.' }, { status: 429 })
  }

  try {
    const body = await request.json().catch(() => null)
    const parsed = adminInviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz davet bilgisi' }, { status: 400 })
    }
    const { email: validEmail, displayName, roleId, requestId } = parsed.data

    // Creating an account and assigning an authorization role are distinct
    // privileges. Reject before sending an invitation email if the actor only
    // has user-management permission.
    if (roleId && !await checkPermission(supabase, 'admin.roles.manage')) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    // Service role client ile kullanıcı davet et
    const serviceClient = createServiceRoleClient()
    const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
      validEmail,
      { data: { full_name: displayName || undefined } },
    )

    if (inviteError) {
      // Duplicate email
      if (inviteError.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'Bu e-posta adresi zaten kayıtlı' }, { status: 409 })
      }
      return NextResponse.json({ error: inviteError.message || 'Davet gönderilemedi' }, { status: 400 })
    }

    const newUserId = inviteData.user?.id
    if (!newUserId) {
      return NextResponse.json({ error: 'Kullanıcı oluşturulamadı' }, { status: 500 })
    }

    // Opsiyonel: Rol ata
    if (roleId) {
      const { error: roleError } = await callAdminRbacRpc(serviceClient, 'admin_assign_role', {
        p_actor_id: admin.id,
        p_user_id: newUserId,
        p_role_id: roleId,
        p_request_id: requestId,
      })
      if (roleError) {
        // Auth invitation and Postgres cannot share one transaction. Remove only
        // the just-created user so a failed RBAC assignment is never reported as
        // a successful role-bearing invitation.
        const { error: compensationError } = await serviceClient.auth.admin.deleteUser(newUserId)
        if (compensationError) {
          return NextResponse.json({ error: 'Davet geri alma işlemi tamamlanamadı' }, { status: 500 })
        }
        return adminRbacErrorResponse(roleError)
      }
    }

    // Admin log kaydet (IP + user-agent dahil)
    await logAdminAction({
      adminId: admin.id,
      action: 'create_user',
      targetType: 'user',
      targetId: newUserId,
      details: { email: validEmail, displayName, roleId, requestId },
      request,
    })

    return NextResponse.json({ success: true, userId: newUserId })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission, logAdminAction } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { NextResponse, type NextRequest } from 'next/server'

const adminUserLimiter = createRateLimiter('admin-users-create', 10, 60_000) // 10/dk

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
  const { data: rows } = await supabase.rpc('search_profiles_admin', {
    q: search || null,
    result_offset: offset,
    result_limit: limit,
  })

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

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.users.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, action } = body

  if (!userId || !action) {
    return NextResponse.json({ error: 'Missing userId or action' }, { status: 400 })
  }

  // Gecerli action kontrolu
  if (!['promote', 'demote'].includes(action)) {
    return NextResponse.json({ error: 'Gecersiz action' }, { status: 400 })
  }

  // Admin kendini demote edemez
  if (action === 'demote' && userId === admin.id) {
    return NextResponse.json({ error: 'Kendinizi demote edemezsiniz' }, { status: 400 })
  }

  const newRole = action === 'promote' ? 'admin' : 'user'
  const { data: affected } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)
    .select('id')

  if (!affected || affected.length === 0) {
    return NextResponse.json({ error: 'Kullanici bulunamadi' }, { status: 404 })
  }

  // Admin log kaydet (IP + user-agent dahil)
  await logAdminAction(supabase, {
    adminId: admin.id,
    action,
    targetType: 'user',
    targetId: userId,
    details: { action, newRole },
    request,
  })

  return NextResponse.json({ success: true })
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
    const body = await request.json()
    const { email, displayName, roleId } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'E-posta adresi gerekli' }, { status: 400 })
    }

    // RFC uyumlu email doğrulama + uzunluk limiti
    const { z } = await import('zod')
    const emailResult = z.string().email().max(254).safeParse(email.trim().toLowerCase())
    if (!emailResult.success) {
      return NextResponse.json({ error: 'Geçersiz e-posta formatı' }, { status: 400 })
    }
    const validEmail = emailResult.data

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
      const svc = createServiceRoleClient()
      await svc.from('user_roles').insert({
        user_id: newUserId,
        role_id: roleId,
        assigned_by: admin.id,
      })
    }

    // Admin log kaydet (IP + user-agent dahil)
    await logAdminAction(supabase, {
      adminId: admin.id,
      action: 'create_user',
      targetType: 'user',
      targetId: newUserId,
      details: { email: validEmail, displayName, roleId },
      request,
    })

    return NextResponse.json({ success: true, userId: newUserId })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

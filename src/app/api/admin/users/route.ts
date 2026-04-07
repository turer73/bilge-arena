import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { escapeForLike } from '@/lib/utils/security'
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

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (search) {
    const safe = escapeForLike(search)
    query = query.or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%`)
  }

  const { data: users, count } = await query.range(offset, offset + limit - 1)

  // RBAC: Her kullanıcının atanmış rollerini de getir
  let usersWithRoles = users || []
  if (users && users.length > 0) {
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

  // Admin log kaydet
  await supabase.from('admin_logs').insert({
    admin_id: admin.id,
    action,
    target_type: 'user',
    target_id: userId,
    details: { action },
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
      await supabase.from('user_roles').insert({
        user_id: newUserId,
        role_id: roleId,
        assigned_by: admin.id,
      })
    }

    // Admin log kaydet
    await supabase.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'create_user',
      target_type: 'user',
      target_id: newUserId,
      details: { email: validEmail, displayName, roleId },
    })

    return NextResponse.json({ success: true, userId: newUserId })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const assignLimiter = createRateLimiter('admin-role-assign', 10, 60_000)

/**
 * POST /api/admin/roles/assign
 * Kullanıcıya rol ata.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const rl = await assignLimiter.check(ip)
    if (!rl.success) {
      return NextResponse.json({ error: 'Çok fazla istek' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } })
    }

    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const { userId, roleId } = await request.json()

    if (!userId || !roleId) {
      return NextResponse.json({ error: 'userId ve roleId zorunlu' }, { status: 400 })
    }

    // Kullanıcı ve rol kontrolü
    const [{ data: user }, { data: role }] = await Promise.all([
      supabase.from('profiles').select('id, username').eq('id', userId).single(),
      supabase.from('roles').select('id, slug, name').eq('id', roleId).single(),
    ])

    if (!user) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
    if (!role) return NextResponse.json({ error: 'Rol bulunamadı' }, { status: 404 })

    // Ata
    const svc = createServiceRoleClient()
    const { error } = await svc
      .from('user_roles')
      .insert({ user_id: userId, role_id: roleId, assigned_by: admin.id })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bu rol zaten atanmış' }, { status: 409 })
      }
      throw error
    }

    // Admin log
    await svc.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'assign_role',
      target_type: 'user',
      target_id: userId,
      details: { role_slug: role.slug, role_name: role.name },
    })

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
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const rl = await assignLimiter.check(ip)
    if (!rl.success) {
      return NextResponse.json({ error: 'Çok fazla istek' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } })
    }

    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const { userId, roleId } = await request.json()

    if (!userId || !roleId) {
      return NextResponse.json({ error: 'userId ve roleId zorunlu' }, { status: 400 })
    }

    // Kendi super_admin rolünü kaldırmayı engelle
    const { data: role } = await supabase
      .from('roles')
      .select('slug')
      .eq('id', roleId)
      .single()

    if (role?.slug === 'super_admin' && userId === admin.id) {
      return NextResponse.json({
        error: 'Kendi Süper Admin rolünüzü kaldıramazsınız',
      }, { status: 400 })
    }

    // Kaldır
    const svc = createServiceRoleClient()
    const { error } = await svc
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId)

    if (error) throw error

    // Admin log
    await svc.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'remove_role',
      target_type: 'user',
      target_id: userId,
      details: { role_slug: role?.slug },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

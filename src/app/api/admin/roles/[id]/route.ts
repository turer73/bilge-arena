import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'

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

    const { id } = await params
    const body = await request.json()
    const { name, description, permissions } = body

    // Rolün var olduğunu kontrol et
    const { data: role } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single()

    if (!role) {
      return NextResponse.json({ error: 'Rol bulunamadı' }, { status: 404 })
    }

    // Rol bilgilerini güncelle
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description

    if (Object.keys(updates).length > 0) {
      await supabase.from('roles').update(updates).eq('id', id)
    }

    // İzinleri güncelle (mevcut izinleri sil, yenileri ekle)
    if (permissions && Array.isArray(permissions)) {
      await supabase.from('role_permissions').delete().eq('role_id', id)

      if (permissions.length > 0) {
        const permRows = permissions.map((p: string) => ({
          role_id: id,
          permission: p,
        }))
        await supabase.from('role_permissions').insert(permRows)
      }
    }

    // Admin log
    await supabase.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'update_role',
      target_type: 'role',
      target_id: id,
      details: { name, description, permissions },
    })

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.roles.manage')
    if (!admin) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

    const { id } = await params

    // Rolü kontrol et
    const { data: role } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single()

    if (!role) {
      return NextResponse.json({ error: 'Rol bulunamadı' }, { status: 404 })
    }

    if (role.is_system) {
      return NextResponse.json({ error: 'Sistem rolleri silinemez' }, { status: 400 })
    }

    // Atanmış kullanıcı var mı kontrol et
    const { data: assignments } = await supabase
      .from('user_roles')
      .select('id')
      .eq('role_id', id)
      .limit(1)

    if (assignments && assignments.length > 0) {
      return NextResponse.json({
        error: 'Bu role atanmış kullanıcılar var. Önce kullanıcıları başka role taşıyın.',
      }, { status: 400 })
    }

    // Sil (cascade ile izinler de silinir)
    await supabase.from('roles').delete().eq('id', id)

    // Admin log
    await supabase.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'delete_role',
      target_type: 'role',
      target_id: id,
      details: { slug: role.slug, name: role.name },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { homepageElementUpdateSchema } from '@/lib/validations/schemas'
import type { Json, TablesUpdate } from '@/types/database.generated'

/**
 * PATCH /api/admin/homepage/elements/[id]
 * Element alanlarini guncelle (whitelist).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.homepage.edit')
    if (!admin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    const { id } = await params
    const body = await request.json()

    // Zod ile hem tip guvenligi hem whitelist dogrulamasi
    const parsed = homepageElementUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Güncellenecek geçerli alan bulunamadı' },
        { status: 400 }
      )
    }
    // styles JSONB sutunu; zod'dan Record<string, unknown> cikiyor. Deger
    // request.json() ciktisindan geldigi icin Json-uyumlulugu tanim geregi
    // saglaniyor, daraltma guvenli.
    const { styles, ...rest } = parsed.data
    const updates: TablesUpdate<'homepage_elements'> = {
      ...rest,
      ...(styles !== undefined ? { styles: styles as Json } : {}),
    }

    const svc = createServiceRoleClient()
    const { error } = await svc
      .from('homepage_elements')
      .update(updates)
      .eq('id', id)

    if (error) {
      return dbErrorResponse('admin/homepage/elements/[id]', error)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/homepage/elements/[id]
 * Element sil.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const admin = await checkPermission(supabase, 'admin.homepage.edit')
    if (!admin) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const rlRes = await checkAdminMutationRl(admin.id)
    if (rlRes) return rlRes

    const { id } = await params

    const svc = createServiceRoleClient()
    const { error } = await svc
      .from('homepage_elements')
      .delete()
      .eq('id', id)

    if (error) {
      return dbErrorResponse('admin/homepage/elements/[id]', error)
    }

    // Admin log
    await svc.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'delete_homepage_element',
      target_type: 'homepage_element',
      target_id: id,
      details: {},
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

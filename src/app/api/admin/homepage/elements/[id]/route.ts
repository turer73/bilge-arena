import { NextRequest, NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import {
  homepageElementDeleteSchema,
  homepageElementUpdateSchema,
} from '@/lib/validations/schemas'
import type { Json } from '@/types/database.generated'
import { z } from 'zod'

const elementIdSchema = z.string().uuid()

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

    const id = elementIdSchema.safeParse((await params).id)
    if (!id.success) {
      return NextResponse.json({ error: 'Geçersiz öğe kimliği' }, { status: 400 })
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
    }

    // Zod ile hem tip guvenligi hem whitelist dogrulamasi
    const parsed = homepageElementUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Güncellenecek geçerli alan bulunamadı' },
        { status: 400 }
      )
    }
    const {
      requestId,
      content,
      image_url,
      alt_text,
      placement,
      alignment,
      size,
      styles,
      sort_order,
      is_published,
    } = parsed.data
    const updates: Record<string, Json> = {}
    if (content !== undefined) updates.content = content
    if (image_url !== undefined) updates.imageUrl = image_url
    if (alt_text !== undefined) updates.altText = alt_text
    if (placement !== undefined) updates.placement = placement
    if (alignment !== undefined) updates.alignment = alignment
    if (size !== undefined) updates.size = size
    if (styles !== undefined) updates.styles = styles as Json
    if (sort_order !== undefined) updates.sortOrder = sort_order
    if (is_published !== undefined) updates.isPublished = is_published

    const svc = createServiceRoleClient()
    const { data, error } = await svc.rpc('mutate_admin_homepage', {
      p_user_id: admin.id,
      p_request_id: requestId,
      p_operation: 'element_update',
      p_payload: { id: id.data, updates },
    })

    if (error) {
      return dbErrorResponse('admin/homepage/elements/[id]', error)
    }

    const result = data && typeof data === 'object' && !Array.isArray(data) ? data : null
    const element = result?.element
    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      return NextResponse.json({ error: 'Öğe sonucu doğrulanamadı' }, { status: 500 })
    }

    return NextResponse.json({ success: true, element, replayed: result?.replayed === true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/homepage/elements/[id]
 * Element sil.
 */
export async function DELETE(
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

    const id = elementIdSchema.safeParse((await params).id)
    if (!id.success) {
      return NextResponse.json({ error: 'Geçersiz öğe kimliği' }, { status: 400 })
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
    }
    const parsed = homepageElementDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek kimliği' }, { status: 400 })
    }

    const svc = createServiceRoleClient()
    const { data, error } = await svc.rpc('mutate_admin_homepage', {
      p_user_id: admin.id,
      p_request_id: parsed.data.requestId,
      p_operation: 'element_delete',
      p_payload: { id: id.data },
    })

    if (error) {
      return dbErrorResponse('admin/homepage/elements/[id]', error)
    }

    const result = data && typeof data === 'object' && !Array.isArray(data) ? data : null
    if (!result || result.success !== true || result.deletedId !== id.data) {
      return NextResponse.json({ error: 'Silme sonucu doğrulanamadı' }, { status: 500 })
    }

    return NextResponse.json({ success: true, replayed: result.replayed === true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

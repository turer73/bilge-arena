import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'

const idSchema = z.string().uuid()

const updateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(200).nullable().optional(),
    category: z.string().min(1).max(20).optional(),
    rarity: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
    coinCost: z.number().int().min(0).max(100000).optional(),
    iconUrl: z.string().url().nullable().optional(),
    isPublished: z.boolean().optional(),
  })
  .strict()

/** PATCH /api/admin/cosmetic-badges/[id] — rozeti güncelle. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.badges.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rlRes = await checkAdminMutationRl(admin.id)
  if (rlRes) return rlRes

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }
  const d = parsed.data

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (d.name !== undefined) updates.name = d.name
  if (d.description !== undefined) updates.description = d.description
  if (d.category !== undefined) updates.category = d.category
  if (d.rarity !== undefined) updates.rarity = d.rarity
  if (d.coinCost !== undefined) updates.coin_cost = d.coinCost
  if (d.iconUrl !== undefined) updates.icon_url = d.iconUrl
  if (d.isPublished !== undefined) updates.is_published = d.isPublished

  // Yayına alınıyorsa görsel garantisi (mevcut + gelen)
  if (d.isPublished === true) {
    const svcCheck = createServiceRoleClient()
    const { data: current } = await svcCheck
      .from('cosmetic_badges')
      .select('icon_url')
      .eq('id', id)
      .maybeSingle()
    const icon = d.iconUrl !== undefined ? d.iconUrl : current?.icon_url
    if (!icon) {
      return NextResponse.json({ error: 'Yayınlamak için rozet görseli gerekli' }, { status: 400 })
    }
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('cosmetic_badges')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/cosmetic-badges] update hatası:', error.code)
    return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Rozet bulunamadı' }, { status: 404 })
  }

  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'update_cosmetic_badge',
    target_type: 'cosmetic_badge',
    target_id: id,
    details: { keys: Object.keys(updates) },
  })

  return NextResponse.json({ badge: data })
}

/** DELETE /api/admin/cosmetic-badges/[id] — rozeti sil (satın alanlar slug'ı kaybeder). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.badges.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rlRes = await checkAdminMutationRl(admin.id)
  if (rlRes) return rlRes

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('cosmetic_badges')
    .delete()
    .eq('id', id)
    .select('slug')
    .maybeSingle()

  if (error) {
    console.error('[admin/cosmetic-badges] delete hatası:', error.code)
    return NextResponse.json({ error: 'Silinemedi' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Rozet bulunamadı' }, { status: 404 })
  }

  // Storage temizliği (best-effort)
  await svc.storage.from('badge-assets').remove([
    `${data.slug}/icon.png`,
    `${data.slug}/icon.jpg`,
    `${data.slug}/icon.webp`,
  ])

  // Satın alanların owned listesinden çöp slug'ı temizle (Codex P2)
  const { data: owners } = await svc
    .from('profiles')
    .select('id, owned_cosmetic_badges')
    .contains('owned_cosmetic_badges', [data.slug])
  for (const o of owners ?? []) {
    await svc
      .from('profiles')
      .update({ owned_cosmetic_badges: (o.owned_cosmetic_badges as string[]).filter((s) => s !== data.slug) })
      .eq('id', o.id)
  }

  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'delete_cosmetic_badge',
    target_type: 'cosmetic_badge',
    target_id: id,
    details: { slug: data.slug },
  })

  return NextResponse.json({ success: true })
}

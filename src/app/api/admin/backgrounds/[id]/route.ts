import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import type { TablesUpdate } from '@/types/database.generated'

const idSchema = z.string().uuid()

const variantsSchema = z
  .object({
    hd: z.string().url().optional(),
    k2: z.string().url().optional(),
    k4: z.string().url().optional(),
  })
  .strict()

const updateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(200).nullable().optional(),
    category: z.string().min(1).max(20).optional(),
    rarity: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
    coinCost: z.number().int().min(0).max(100000).optional(),
    variants: variantsSchema.optional(),
    posterUrl: z.string().url().nullable().optional(),
    isPublished: z.boolean().optional(),
  })
  .strict()

/**
 * PATCH /api/admin/backgrounds/[id] — Video temayı güncelle (fiyat, yayın
 * durumu, varyantlar). checkPermission('admin.backgrounds.manage').
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.backgrounds.manage')
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

  // snake_case kolon eşlemesi (yalnız gönderilen alanlar)
  const updates: TablesUpdate<'background_assets'> = { updated_at: new Date().toISOString() }
  if (d.name !== undefined) updates.name = d.name
  if (d.description !== undefined) updates.description = d.description
  if (d.category !== undefined) updates.category = d.category
  if (d.rarity !== undefined) updates.rarity = d.rarity
  if (d.coinCost !== undefined) updates.coin_cost = d.coinCost
  if (d.variants !== undefined) updates.variants = d.variants
  if (d.posterUrl !== undefined) updates.poster_url = d.posterUrl
  if (d.isPublished !== undefined) updates.is_published = d.isPublished

  // Yayın/varyant tutarlılığı (Codex P2): variants={} + isPublished omit ile
  // YAYINDAKİ temayı varyantsız bırakmayı engelle — son durumu kontrol et.
  if (d.isPublished === true || d.variants !== undefined) {
    const svcCheck = createServiceRoleClient()
    const { data: current } = await svcCheck
      .from('background_assets')
      .select('variants, is_published')
      .eq('id', id)
      .maybeSingle()
    const finalPublished = d.isPublished ?? current?.is_published ?? false
    // variants gönderildiyse REPLACE edilir (merge değil); gönderilmediyse mevcut kalır
    const finalVariants = (d.variants !== undefined
      ? d.variants
      : (current?.variants as Record<string, string>)) ?? {}
    if (finalPublished && !finalVariants.hd && !finalVariants.k2 && !finalVariants.k4) {
      return NextResponse.json(
        { error: 'Yayındaki tema en az bir video varyantı içermeli' },
        { status: 400 },
      )
    }
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('background_assets')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/backgrounds] update hatası:', error.code)
    return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Tema bulunamadı' }, { status: 404 })
  }

  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'update_background',
    target_type: 'background_asset',
    target_id: id,
    details: { keys: Object.keys(updates) },
  })

  return NextResponse.json({ background: data })
}

/**
 * DELETE /api/admin/backgrounds/[id] — Video temayı sil.
 * Uyarı: satılmış bir tema silinirse o slug owned_backgrounds'ta artık
 * geçersiz olur (resolveOwnedSelection fallback'e düşer, çökme yok).
 * Tercihen yayından kaldırma (isPublished=false) kullanılmalı.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.backgrounds.manage')
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
    .from('background_assets')
    .delete()
    .eq('id', id)
    .select('slug')
    .maybeSingle()

  if (error) {
    console.error('[admin/backgrounds] delete hatası:', error.code)
    return NextResponse.json({ error: 'Silinemedi' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Tema bulunamadı' }, { status: 404 })
  }

  // Storage klasörünü temizle (best-effort; hata silmeyi geri almaz)
  const exts = ['mp4', 'webm', 'png', 'jpg', 'webp']
  const kinds = ['hd', 'k2', 'k4', 'poster']
  const paths = kinds.flatMap((k) => exts.map((e) => `${data.slug}/${k}.${e}`))
  await svc.storage.from('video-backgrounds').remove(paths)

  // Satın alanların owned listesinden çöp slug'ı temizle (Codex P2)
  const { data: owners } = await svc
    .from('profiles')
    .select('id, owned_backgrounds')
    .contains('owned_backgrounds', [data.slug])
  for (const o of owners ?? []) {
    await svc
      .from('profiles')
      .update({ owned_backgrounds: (o.owned_backgrounds as string[]).filter((s) => s !== data.slug) })
      .eq('id', o.id)
  }

  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'delete_background',
    target_type: 'background_asset',
    target_id: id,
    details: { slug: data.slug },
  })

  return NextResponse.json({ success: true })
}

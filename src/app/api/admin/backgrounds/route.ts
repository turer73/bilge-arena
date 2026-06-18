import { NextResponse, type NextRequest } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { PROFILE_BACKGROUNDS } from '@/lib/constants/profile-backgrounds'

const variantsSchema = z
  .object({
    hd: z.string().url().optional(),
    k2: z.string().url().optional(),
    k4: z.string().url().optional(),
  })
  .strict()

const createSchema = z.object({
  // CSS slug'larıyla + owned_backgrounds id'leriyle çakışmamalı
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'slug yalnız küçük harf, rakam ve tire içerebilir'),
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  category: z.string().min(1).max(20).default('video'),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']).default('epic'),
  coinCost: z.number().int().min(0).max(100000),
  variants: variantsSchema.default({}),
  posterUrl: z.string().url().optional(),
  isPublished: z.boolean().default(false),
})

/**
 * GET /api/admin/backgrounds — Tüm video temalar (taslak dahil).
 * checkPermission('admin.backgrounds.view').
 */
export async function GET(request: NextRequest) {
  void request
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.backgrounds.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('background_assets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return dbErrorResponse('admin/backgrounds', error)
  }
  return NextResponse.json({ backgrounds: data ?? [] })
}

/**
 * POST /api/admin/backgrounds — Yeni video tema oluştur.
 * checkPermission('admin.backgrounds.manage') + rate-limit + admin log.
 * Video dosyaları önce /upload ile yüklenir; burada yalnız URL'ler kaydedilir.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.backgrounds.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rlRes = await checkAdminMutationRl(admin.id)
  if (rlRes) return rlRes

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }
  const d = parsed.data

  // CSS temalarıyla slug çakışması (owned_backgrounds tek isim uzayı)
  if (PROFILE_BACKGROUNDS.some((b) => b.id === d.slug)) {
    return NextResponse.json({ error: 'Bu slug bir CSS temasıyla çakışıyor' }, { status: 409 })
  }

  // Yayınlanacaksa en az bir video varyantı olmalı
  const hasVariant = Boolean(d.variants.hd || d.variants.k2 || d.variants.k4)
  if (d.isPublished && !hasVariant) {
    return NextResponse.json(
      { error: 'Yayınlamak için en az bir video varyantı gerekli' },
      { status: 400 },
    )
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('background_assets')
    .insert({
      slug: d.slug,
      name: d.name,
      description: d.description ?? null,
      category: d.category,
      rarity: d.rarity,
      coin_cost: d.coinCost,
      variants: d.variants,
      poster_url: d.posterUrl ?? null,
      is_published: d.isPublished,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Bu slug zaten kullanılıyor' }, { status: 409 })
    }
    console.error('[admin/backgrounds] insert hatası:', error.code)
    return NextResponse.json({ error: 'Oluşturulamadı' }, { status: 500 })
  }

  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'create_background',
    target_type: 'background_asset',
    target_id: data.id,
    details: { slug: d.slug, is_published: d.isPublished },
  })

  return NextResponse.json({ background: data }, { status: 201 })
}

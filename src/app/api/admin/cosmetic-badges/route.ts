import { NextResponse, type NextRequest } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'

const createSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'slug yalnız küçük harf, rakam ve tire içerebilir'),
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  category: z.string().min(1).max(20).default('genel'),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']).default('epic'),
  coinCost: z.number().int().min(0).max(100000),
  iconUrl: z.string().url().optional(),
  isPublished: z.boolean().default(false),
})

/**
 * GET /api/admin/cosmetic-badges — Tüm kozmetik rozetler (taslak dahil).
 * checkPermission('admin.badges.view').
 */
export async function GET(request: NextRequest) {
  void request
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.badges.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('cosmetic_badges')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return dbErrorResponse('admin/cosmetic-badges', error)
  }
  return NextResponse.json({ badges: data ?? [] })
}

/**
 * POST /api/admin/cosmetic-badges — Yeni kozmetik rozet oluştur.
 * checkPermission('admin.badges.manage') + rate-limit + admin log.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.badges.manage')
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

  // Yayınlanacaksa görsel zorunlu
  if (d.isPublished && !d.iconUrl) {
    return NextResponse.json({ error: 'Yayınlamak için rozet görseli gerekli' }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('cosmetic_badges')
    .insert({
      slug: d.slug,
      name: d.name,
      description: d.description ?? null,
      category: d.category,
      rarity: d.rarity,
      coin_cost: d.coinCost,
      icon_url: d.iconUrl ?? null,
      is_published: d.isPublished,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Bu slug zaten kullanılıyor' }, { status: 409 })
    }
    console.error('[admin/cosmetic-badges] insert hatası:', error.code)
    return NextResponse.json({ error: 'Oluşturulamadı' }, { status: 500 })
  }

  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'create_cosmetic_badge',
    target_type: 'cosmetic_badge',
    target_id: data.id,
    details: { slug: d.slug, is_published: d.isPublished },
  })

  return NextResponse.json({ badge: data }, { status: 201 })
}

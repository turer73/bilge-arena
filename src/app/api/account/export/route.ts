import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const exportLimiter = createRateLimiter('account-data-export', 2, 3_600_000)
const accountExportSchema = z.object({
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  coverage: z.object({
    directSubjectColumns: z.literal(true),
    relatedTables: z.array(z.string()),
  }).strict(),
}).strict()

export const dynamic = 'force-dynamic'

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const limited = await exportLimiter.check(user.id)
  if (!limited.success) {
    const unavailable = limited.reason === 'backend_unavailable'
    return NextResponse.json(
      { error: unavailable ? 'Güvenlik servisi geçici olarak kullanılamıyor' : 'Dışa aktarma limiti aşıldı' },
      {
        status: unavailable ? 503 : 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(limited.retryAfter ?? 60),
        },
      },
    )
  }

  const db = createServiceRoleClient()
  const { data, error } = await db.rpc('export_account_data', { p_user_id: user.id })
  if (error) {
    console.error('[Account Export] veri derleme hatası:', error.message)
    return NextResponse.json({ error: 'Veri dışa aktarılamadı' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const parsed = accountExportSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[Account Export] RPC sözleşmesi doğrulanamadı')
    return NextResponse.json({ error: 'Veri dışa aktarılamadı' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const exportedAt = new Date().toISOString()
  const payload = {
    schemaVersion: 'bilge-arena-dsar-v2',
    exportedAt,
    account: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    coverage: parsed.data.coverage,
    data: parsed.data.tables,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="bilge-arena-verilerim-${exportedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

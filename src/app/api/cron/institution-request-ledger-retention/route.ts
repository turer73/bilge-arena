import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const resultSchema = z.object({
  cutoff: z.string().datetime({ offset: true }),
  pilotInstitutionRequestsDeleted: z.number().int().nonnegative(),
  teacherClassroomRequestsDeleted: z.number().int().nonnegative(),
}).strict()

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return noStore({ error: 'CRON_SECRET ayarlanmamış' }, 500)
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return noStore({ error: 'Yetkisiz' }, 401)
  }

  const configuredDays = Number(process.env.INSTITUTION_REQUEST_LEDGER_RETENTION_DAYS ?? '90')
  // SQL uses a moving clock_timestamp() and rejects cutoffs older than two
  // calendar years. Keep one full day of headroom so network/transaction time
  // can never turn an accepted edge value into a rejected RPC call.
  if (!Number.isInteger(configuredDays) || configuredDays < 30 || configuredDays > 729) {
    return noStore({ error: 'Kurum istek kaydı saklama süresi geçersiz' }, 500)
  }
  const cutoff = new Date(Date.now() - configuredDays * 86_400_000).toISOString()
  const service = createServiceRoleClient()
  const { data, error } = await service.rpc('prune_institution_request_ledgers', {
    p_cutoff: cutoff,
  })
  if (error) return noStore({ error: 'Kurum istek kayıtları temizlenemedi' }, 500)

  const parsed = resultSchema.safeParse(data)
  return parsed.success
    ? noStore(parsed.data)
    : noStore({ error: 'Kurum istek kaydı temizleme sonucu doğrulanamadı' }, 500)
}

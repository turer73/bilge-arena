import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const CRON_SECRET = process.env.CRON_SECRET

interface HoneypotIntegrityRow {
  honeypot_exists: boolean
  honeypot_username: string | null
  honeypot_xp: number | null
  honeypot_last_played_at: string | null
  drift_detected: boolean
  message: string
}

/**
 * GET /api/cron/honeypot-check
 * Honeypot sentinel bütünlük taraması (migration 051/052/053/054 zinciri).
 *
 * `check_honeypot_integrity()` RPC'sini çağırır:
 * - Kayıt SİLİNMİŞ veya alanları DEĞİŞMİŞ ise (drift) bu, profiles dump'ı /
 *   yetkisiz yazma belirtisidir → Sentry'ye fatal event (alarm).
 * - RPC hatası da alarm sayılır (tripwire'ın kendisi kör kalmamalı).
 *
 * Vercel Cron 6 saatte bir tetikler. Güvenlik: CRON_SECRET header
 * (weekly-digest/daily-streak-reminder paterni).
 */
export async function GET(req: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET ayarlanmamis' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('check_honeypot_integrity')

  if (error) {
    // Tripwire kör kalmasin: RPC hatasi da alarmdir
    Sentry.captureMessage(
      `[honeypot-check] RPC hatasi: ${error.code ?? 'bilinmiyor'}`,
      { level: 'error', extra: { code: error.code, message: error.message } },
    )
    await Sentry.flush(2000)
    console.error('[honeypot-check] RPC hatasi:', error.code)
    return NextResponse.json({ error: 'Integrity sorgusu basarisiz' }, { status: 500 })
  }

  // RETURNS TABLE → tek satirlik dizi
  const row = (Array.isArray(data) ? data[0] : data) as HoneypotIntegrityRow | undefined

  if (!row) {
    Sentry.captureMessage('[honeypot-check] RPC bos sonuc dondu', { level: 'error' })
    await Sentry.flush(2000)
    return NextResponse.json({ error: 'Bos sonuc' }, { status: 500 })
  }

  if (row.drift_detected) {
    // ALARM: honeypot silinmis/degismis — olasi exfiltrasyon/yetkisiz yazma
    Sentry.captureMessage(`[HONEYPOT ALARM] ${row.message}`, {
      level: 'fatal',
      extra: {
        honeypot_exists: row.honeypot_exists,
        honeypot_xp: row.honeypot_xp,
        honeypot_last_played_at: row.honeypot_last_played_at,
        // username'i bilerek log DISI birakiyoruz: alarm akisinda PII/tuzak
        // detayi gerekmiyor, Sentry'de yeterli baglam mevcut alanlarda var
      },
    })
    await Sentry.flush(2000)
    console.error('[honeypot-check] DRIFT:', row.message)
    return NextResponse.json(
      { status: 'alarm', drift: true, message: row.message },
      { status: 200 }, // cron basariyla calisti; alarm Sentry'de
    )
  }

  return NextResponse.json({ status: 'ok', drift: false })
}

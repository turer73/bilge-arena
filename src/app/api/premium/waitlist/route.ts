/**
 * POST /api/premium/waitlist
 * --------------------------------------------------------------
 * /arena/premium sayfasindaki "Lansman Bildirim Al" formunun submit endpoint'i.
 *
 * Akis:
 *   1. Rate-limit (IP bazli, 5 req/dk -- form abuse korumasi)
 *   2. Zod parse (premiumWaitlistSchema -- email + plan + KVKK acik riza)
 *   3. INSERT premium_waitlist via service-role client
 *      - 23505 unique violation -> idempotent 200 (ayni email tekrar submit)
 *      - Diger DB hatasi -> 500 (loglanir, kullanici tarafa generic mesaj)
 *   4. Best-effort confirmation email (Resend)
 *      - Resend hatasi 200'u bozmaz; user form basariyla submit etti.
 *      - RESEND_API_KEY yoksa email step skip (dev ortami).
 *
 * Codex P1 fix (2026-04-26):
 *   Onceki versiyon `createClient()` (anon-context) kullaniyordu ve RLS policy
 *   `premium_waitlist_insert_anyone` `TO PUBLIC` (default, anon dahil) olarak acikti.
 *   Sonuc: anon kullanici PostgREST uzerinden direkt /rest/v1/premium_waitlist?...
 *   call ile rate-limit + KVKK validation'i bypass edip raw INSERT yapabiliyordu.
 *   Iki katmanli fix:
 *     1. Migration 039: RLS policy `TO service_role` ile kilitlenir.
 *     2. Bu route: service-role client kullanir (RLS bypass'a yetkili).
 *   Sonuc: yalnizca bu route INSERT yapabilir; rate-limit + Zod validation tek kapidir.
 *
 * KVKK notu:
 *   kvkkConsent literal(true) zod'da zorunlu. kvkk_consent_at sutunu insert
 *   sirasinda new Date() ile yazilir (audit kanit).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NextResponse } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { premiumWaitlistSchema } from '@/lib/validations/schemas'
import { getClientIp } from '@/lib/utils/client-ip'
import { Resend } from 'resend'

// 5 req/dk: tek bir kullanici/bot tek IP'den dakikada 5'ten fazla submit edemez.
// Legit user 1-2 deneme yapar; bot bu sinirin ustune cikarsa rate-limit'e takilir.
const waitlistLimiter = createRateLimiter('premium-waitlist', 5, 60_000)

export async function POST(request: Request) {
  // ─── Rate-limit ────────────────────────────────────────────
  // getClientIp anti-XFF-spoof: cf-connecting-ip > x-real-ip > XFF rightmost.
  // Headers yoksa 'unknown' doner — 'anonymous' fallback bucket'a yonlendir.
  const ip = getClientIp(request.headers)
  const ipKey = ip !== 'unknown' ? ip : 'anonymous'

  const rl = await waitlistLimiter.check(ipKey)
  if (!rl.success) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
      }
    )
  }

  // ─── Body parse ────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 }
    )
  }

  const parsed = premiumWaitlistSchema.safeParse(rawBody)
  if (!parsed.success) {
    // flatten() KVKK + email + plan hatalarini frontend'e dondurur (form display).
    return NextResponse.json(
      { ok: false, error: 'validation', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { email, plan, source } = parsed.data
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null

  // ─── INSERT (service-role client; migration 039 RLS lock'u ile uyumlu) ──
  const supabase = createServiceRoleClient()
  const { error: insertError } = await supabase
    .from('premium_waitlist')
    .insert({
      email,
      plan,
      source: source ?? null,
      kvkk_consent_at: new Date().toISOString(),
      ip_address: ipKey === 'anonymous' ? null : ipKey,
      user_agent: userAgent,
    })

  if (insertError) {
    // 23505 = postgres unique_violation. lower(email) UNIQUE indexi ile
    // ayni email iki kez submit edilmis demektir. Sessiz idempotent basari --
    // user'a "zaten kayitlisin" demek bilgi sizdirir, KVKK minimization icin uygun degil.
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    console.error('[premium/waitlist] DB insert failed:', insertError.message)
    return NextResponse.json({ ok: false, error: 'db' }, { status: 500 })
  }

  // ─── Best-effort confirmation email ────────────────────────
  // Resend env yoksa veya hata olusursa 200'u bozmaz. Form submit basarili,
  // email gelmemesi user perspektifinden tolere edilir (DB'de kayit var).
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const planLabel = plan === 'monthly' ? 'aylık' : 'yıllık'
      await resend.emails.send({
        from: 'Bilge Arena <bildirim@bilgearena.com>',
        to: email,
        subject: 'Premium lansman bildirim listesindesin',
        html: `
          <p>Merhaba,</p>
          <p>Bilge Arena Premium <strong>${planLabel}</strong> plan için
          lansman bildirim listene eklendin. Ödeme entegrasyonu hazır olduğunda
          ilk haberdar olanlardan biri olacaksın.</p>
          <p>Bu maile cevap atarak istediğinde abonelikten çıkabilirsin.</p>
          <p>— Bilge Arena ekibi</p>
        `,
      })
    } catch (emailError) {
      // Email failure is non-fatal: log + continue 200.
      console.error(
        '[premium/waitlist] Resend send failed (record persisted):',
        emailError instanceof Error ? emailError.message : 'unknown'
      )
    }
  }

  return NextResponse.json({ ok: true })
}

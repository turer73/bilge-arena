import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const logLimiter = createRateLimiter('log', 30, 60_000) // 30 req/dk

export async function POST(request: Request) {
  try {
    const { type, message, meta } = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Rate limiting (IP veya userId bazli)
    // Sadece ilk IP'yi al (x-forwarded-for spoofing onleme)
    const key = user?.id || (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'anonymous'
    const rl = logLimiter.check(key)
    if (!rl.success) {
      return NextResponse.json({ ok: false }, { status: 429 })
    }

    // Basit hata loglama — Supabase'e kaydet
    const logEntry = {
      type: type || 'error',
      message: message?.slice(0, 500) || 'Unknown error',
      user_id: user?.id || null,
      meta: meta ? JSON.stringify(meta).slice(0, 1000) : null,
      created_at: new Date().toISOString(),
    }

    // Console'a logla (Vercel Functions'da gorunur)
    console.error(`[${logEntry.type}] ${logEntry.message}`, logEntry.meta)

    // Supabase'e kaydet (client_logs tablosu yoksa sessizce devam et)
    await supabase
      .from('client_logs')
      .insert(logEntry)
      .then(({ error }) => {
        if (error) console.error('[Log API] DB insert hatasi:', error.message)
      })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

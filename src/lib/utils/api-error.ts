import { NextResponse } from 'next/server'

/**
 * Ham PG/DB `error.message`'i CLIENT'a sızdırmadan generic 500 döner + server'a loglar.
 *
 * Postgres hata mesajları schema/tablo/constraint/permission detayı içerir → bilgi
 * ifşası (bkz feedback: postgrest-error-leak). Bu helper ile client daima generic
 * mesaj görür; gerçek hata yalnız server log'una (Vercel) düşer.
 *
 * Kullanım: `if (error) return dbErrorResponse('admin/reports GET', error)`
 */
export function dbErrorResponse(context: string, error: unknown, status = 500) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error)
  console.error(`[${context}]`, message)
  return NextResponse.json({ error: 'Bir hata oluştu.' }, { status })
}

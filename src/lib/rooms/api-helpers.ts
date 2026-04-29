/**
 * Bilge Arena Oda Sistemi: API route helpers (DRY)
 * Sprint 1 PR3b/c
 *
 * 8 endpoint (start, join, leave, cancel, kick, submit, reveal, advance)
 * ortak pattern'i yakalar:
 *   1. createClient() (Panola Supabase) auth.getUser() validate
 *   2. auth.getSession() ile JWT extract
 *   3. callRpc() ile bilge-arena PostgREST RPC
 *   4. toResponse() error / NextResponse OK
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Auth + JWT extract. Discriminated union pattern (RpcResult ile uyumlu).
 *
 * Kullanim:
 *   const auth = await getAuthAndJwt()
 *   if (!auth.ok) return auth.response
 *   // auth.userId, auth.jwt
 */
export async function getAuthAndJwt(): Promise<
  | { ok: true; userId: string; jwt: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Yetkisiz', code: 'P0001' },
        { status: 401 },
      ),
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'JWT alinamadi (session expired?)', code: 'P0001' },
        { status: 401 },
      ),
    }
  }

  return { ok: true, userId: user.id, jwt: session.access_token }
}

/**
 * Body parse + Zod validate, error response donerse early-return.
 *
 * Kullanim:
 *   const validated = await parseBody(req, mySchema)
 *   if (!validated.ok) return validated.response
 *   // validated.data (typed)
 */
export async function parseBody<T>(
  req: Request,
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } },
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Gecersiz JSON', code: 'BAD_JSON' },
        { status: 400 },
      ),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success || !parsed.data) {
    const issues =
      parsed.error?.issues.map((i) => i.message).join(', ') ?? 'Validation hatasi'
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Validation: ${issues}`, code: 'VALIDATION' },
        { status: 400 },
      ),
    }
  }

  return { ok: true, data: parsed.data }
}

/**
 * Empty-body POST handler (rooms/{id}/start, /leave, /reveal, /advance).
 * Zod parse atlanir, sadece room_id path'ten alinir.
 */
export async function parseEmptyBody(req: Request): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // Body bos veya {} olabilir, parse hatasi tolere et
  try {
    const text = await req.text()
    if (text.length > 0 && text !== '{}') {
      // body var ama beklenmeyen — strict tutmuyoruz, sadece warn
    }
  } catch {
    // ignore
  }
  return { ok: true }
}

/**
 * Bilge Arena Oda Sistemi: PostgREST RPC client factory
 * Sprint 1 PR3 (API foundation)
 *
 * Bilge-arena PostgREST endpoint Panola Supabase'den AYRI:
 *   - Panola Supabase: https://lvnmzdowhfzmpkueurih.supabase.co (auth + ana DB)
 *   - Bilge-arena PostgREST: BILGE_ARENA_RPC_URL (oda sistemi RPC)
 *
 * JWT validation: Bilge-arena PostgREST Panola Supabase JWKS URL'i kullanir
 * (generate-postgrest-env.sh:50, PGRST_JWT_SECRET={"jwks_url":"..."}).
 * Yani Panola login JWT'si bilge-arena PostgREST tarafindan kabul edilir.
 *
 * Apply sirasi (server-side API route'larda):
 *   1. createClient() (Panola Supabase) ile auth.getUser() + JWT al
 *   2. callRpc(JWT, 'create_room', {...}) ile bilge-arena RPC cagri
 *   3. Hata varsa normalizeRoomError() ile cevir
 *
 * Plan-deviation #54 (PR3): BILGE_ARENA_RPC_URL configurable env. Production
 * Caddy/DNS hazir olunca https://api.bilgearena.com/rest, dev'de
 * http://127.0.0.1:3001 (Tailscale tunnel + SSH localhost forward).
 */

import { normalizeRoomError, type RoomError } from './errors'

// Default URL (development): Tailscale VPS PostgREST direct
// Production: Caddy reverse-proxy URL (Sprint 2 cleanup)
const BILGE_ARENA_RPC_URL =
  process.env.BILGE_ARENA_RPC_URL ?? 'http://127.0.0.1:3001'

/**
 * RPC call result: success ile data, fail ile error.
 * Discriminated union pattern (TypeScript exhaustiveness checker compatible).
 */
export type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RoomError }

/**
 * PostgREST RPC çağrısı yapar (server-side only).
 *
 * @param jwt Panola Supabase JWT (kullanicidan, supabase.auth.getSession())
 * @param functionName SQL function name (e.g., 'create_room')
 * @param body Function parameters (e.g., { p_title, p_category, ... })
 * @returns RpcResult<T> — discriminated union; data type T caller'a sorumlu
 *
 * NOT: Function signatures auth.uid() kullaniyor (caller identity = JWT 'sub'),
 * dolayisiyla user_id/host_id parametre olarak ALINMAZ. Bu PR2a Codex P1 #37
 * fix'i (impersonation defense) kalitim.
 */
export async function callRpc<T>(
  jwt: string,
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  if (!jwt) {
    return {
      ok: false,
      error: {
        code: 'P0001',
        message: 'Yetki yok',
        status: 401,
      },
    }
  }

  let response: Response
  try {
    response = await fetch(`${BILGE_ARENA_RPC_URL}/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        // PostgREST single-row RPC return convention
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
      // Server-side fetch, no CORS concerns
      cache: 'no-store',
    })
  } catch (err) {
    // Network error (DNS, timeout, refused)
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Network error',
        status: 502,
        raw: err,
      },
    }
  }

  // PostgREST response: 2xx success, 4xx/5xx error
  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch {
      errorBody = { message: await response.text().catch(() => 'Unparseable error') }
    }
    return {
      ok: false,
      error: normalizeRoomError(errorBody),
    }
  }

  // Success: parse JSON body
  try {
    const data = (await response.json()) as T
    return { ok: true, data }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        message: 'Response parse hatasi',
        status: 500,
        raw: err,
      },
    }
  }
}

/**
 * Test convention: vitest'te `globalThis.fetch = vi.fn(...)` ile mock edilir.
 * URL override gerekmez cunku tests fetch implementation'i degil URL'i degistirmez.
 * Custom URL gerektiginde test'ten ONCE process.env.BILGE_ARENA_RPC_URL set et.
 */

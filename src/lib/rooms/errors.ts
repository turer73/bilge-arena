/**
 * Bilge Arena Oda Sistemi: SQL P00xx error code → user-facing message + HTTP status mapping
 * Sprint 1 PR3
 *
 * Custom error code catalog (SQL function'lar RAISE EXCEPTION ... USING ERRCODE = 'P00xx')
 *
 * Plan-deviation #41 (kalitim): Caller identity = auth.uid() — P0001 unified auth error
 */

export const ROOM_ERROR_CODES = {
  P0001: 'Yetki yok',
  P0002: 'Bulunamadi',
  P0003: 'Yanlis state',
  P0004: 'Yetersiz soru',
  P0005: 'Yetersiz oyuncu (en az 2)',
  P0006: 'Oda dolu',
  P0007: 'Zaten uyesin',
  P0008: 'Oda kodu bulunamadi',
  P0009: 'Henuz round baslamadi',
  P0010: 'Sure doldu',
  P0011: 'Zaten cevapladin',
  P0012: 'Round zaten reveal edildi',
  P0013: 'Oda kodu uretilemedi (cluster cok dolu, tekrar dene)',
} as const

export type RoomErrorCode = keyof typeof ROOM_ERROR_CODES

// =============================================================================
// HTTP status mapping (PostgREST default 400/500 yerine semantic)
// =============================================================================
export const ROOM_ERROR_HTTP_STATUS: Record<RoomErrorCode, number> = {
  P0001: 401, // Unauthorized (auth required) - Codex P1 PR #37 fix kalitim
  P0002: 404, // Not Found (oda/uye)
  P0003: 409, // Conflict (yanlis state transition)
  P0004: 400, // Bad Request (yetersiz soru)
  P0005: 400, // Bad Request (yetersiz oyuncu)
  P0006: 409, // Conflict (oda dolu)
  P0007: 409, // Conflict (duplicate)
  P0008: 404, // Not Found (kod bilinmez)
  P0009: 409, // Conflict (round henuz baslamadi)
  P0010: 410, // Gone (sure doldu)
  P0011: 409, // Conflict (already submitted)
  P0012: 410, // Gone (round closed)
  P0013: 503, // Service Unavailable (cluster dolu, retry-after)
}

// =============================================================================
// Error response normalize: PostgREST/PG hata -> RoomError
// =============================================================================
export interface RoomError {
  code: RoomErrorCode | 'UNKNOWN'
  message: string
  status: number
  raw?: unknown // debugging icin
}

/**
 * PostgREST error body / PG error -> RoomError normalize
 *
 * PostgREST RPC response on RAISE EXCEPTION:
 *   { code: "P0001", details: null, hint: null, message: "Authentication required..." }
 */
export function normalizeRoomError(err: unknown): RoomError {
  // PostgREST error response shape
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code
    const message = (err as { message?: unknown }).message

    if (typeof code === 'string' && code in ROOM_ERROR_CODES) {
      const known = code as RoomErrorCode
      return {
        code: known,
        message: ROOM_ERROR_CODES[known],
        status: ROOM_ERROR_HTTP_STATUS[known],
        raw: err,
      }
    }

    // Unknown SQL error code
    return {
      code: 'UNKNOWN',
      message: typeof message === 'string' ? message : 'Bilinmeyen hata',
      status: 500,
      raw: err,
    }
  }

  // Generic Error
  if (err instanceof Error) {
    return {
      code: 'UNKNOWN',
      message: err.message,
      status: 500,
      raw: err,
    }
  }

  return {
    code: 'UNKNOWN',
    message: 'Bilinmeyen hata',
    status: 500,
    raw: err,
  }
}

/**
 * RoomError -> Next.js NextResponse-uyumlu json + status
 * Kullanim: return NextResponse.json(...toResponse(error))
 */
export function toResponse(error: RoomError): { body: { error: string; code: string }; status: number } {
  return {
    body: { error: error.message, code: error.code },
    status: error.status,
  }
}

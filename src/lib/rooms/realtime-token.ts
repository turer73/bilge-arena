/**
 * Bilge Arena Oda Sistemi: Realtime kanal token'i (HS256).
 *
 * VPS'teki self-hosted Realtime (ws-dev tenant) JWKS yerine tenant'a ozel
 * HS256 sirri ile dogruluyor; token'i yalniz /api/realtime/token imzalar.
 *
 * - `aud`: token yalniz Realtime icin gecerli. VPS'te
 *   JWT_CLAIM_VALIDATORS={"aud":"bilge-arena-realtime"} ile zorunlu tutulur;
 *   baska bir HS256 dogrulayicisi ayni sirri paylassa bile bu token'i
 *   kabul etmemeli.
 * - Kisa omur: istemci (oda-realtime-client.ts) bitmeden yeniler. Atilan
 *   oyuncunun kanal yetkisi en gec bir yenilemede yeniden degerlendirilir.
 */

import { createHmac } from 'crypto'

export const REALTIME_TOKEN_AUDIENCE = 'bilge-arena-realtime'
export const REALTIME_TOKEN_TTL_SEC = 600

function b64url(s: string | Buffer): string {
  return (typeof s === 'string' ? Buffer.from(s) : s)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export type RealtimeTokenClaims = {
  role: 'authenticated'
  aud: typeof REALTIME_TOKEN_AUDIENCE
  sub: string
  iat: number
  exp: number
}

export function buildRealtimeTokenClaims(
  userId: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): RealtimeTokenClaims {
  return {
    role: 'authenticated',
    aud: REALTIME_TOKEN_AUDIENCE,
    sub: userId,
    iat: nowSec,
    exp: nowSec + REALTIME_TOKEN_TTL_SEC,
  }
}

export function signRealtimeToken(claims: RealtimeTokenClaims, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64url(sig)}`
}

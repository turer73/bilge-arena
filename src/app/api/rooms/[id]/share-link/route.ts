/**
 * POST /api/rooms/[id]/share-link — imzali /p/[code] paylasim baglantisi
 *
 * Baslik, skor ve kategori istemciden ALINMAZ: oyuncunun kendi JWT'siyle
 * oda-DB'den okunur (RLS: yalniz uye oldugu oda), oda tamamlanmis olmali.
 * Degerler SHARE_LINK_SECRET ile imzalanir; /p/[code] ve OG karti yalniz
 * imzasi tutan degerleri gosterir (genel tarama 2026-10-26, disc #2950).
 *
 * SHARE_LINK_SECRET tanimsizsa imzasiz /p/[code] doner: paylasim calisir,
 * kart genel kalir (fail-safe).
 */

import { NextResponse } from 'next/server'
import { getAuthRateLimited } from '@/lib/rooms/api-helpers'
import { fetchShareableResult } from '@/lib/rooms/server-fetch'
import { shareLinkSecret, signShareClaims } from '@/lib/rooms/share-link'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const ipLimiter = createRateLimiter('rooms-share-link-ip', 120, 60_000)
const userLimiter = createRateLimiter('rooms-share-link-user', 30, 60_000)

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthRateLimited(req, ipLimiter, userLimiter)
  if (!auth.ok) return auth.response

  const { id } = await params
  const result = await fetchShareableResult(auth.jwt, id, auth.userId)
  if (!result) {
    return NextResponse.json(
      { error: 'Paylasilabilir sonuc bulunamadi', code: 'P0002' },
      { status: 404 },
    )
  }

  const path = `/p/${encodeURIComponent(result.code)}`
  const secret = shareLinkSecret()
  const signed = secret
    ? await signShareClaims(
        { code: result.code, title: result.title, score: result.score, category: result.category },
        secret,
      )
    : null

  return NextResponse.json(
    { path: signed ? `${path}?${signed.toString()}` : path, signed: Boolean(signed) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

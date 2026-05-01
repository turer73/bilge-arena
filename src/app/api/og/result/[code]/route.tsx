import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

/**
 * Bilge Arena Oda: /api/og/result/[code] OG image dynamic route
 * Sprint 2C Task 8 PR2 (PR #63 follow-up)
 *
 * Replay & Share viral kart icin OG image. Querystring driven (DB fetch YOK):
 *   /api/og/result/ABC123?title=Genel+Kultur&score=850&category=matematik
 *
 * Pattern: src/app/og/route.tsx (PR5 TDK uyumda eklenmis), Inter-Bold.woff
 * public/fonts/ altinda CDN cached. Edge runtime + 1 MB bundle limit guvenli.
 *
 * Memory id=feedback_satori_woff2_unsupported: WOFF2 yasak, WOFF v1 kullanilir
 * (public/fonts/Inter-Bold.woff Google Fonts IE UA fetch ile bundled).
 *
 * Plan-deviation: Page metadata + ShareButton URL guncelleme bu PR'da YOK.
 * Sonraki PR'da: /(player)/oda/[code]/page.tsx generateMetadata fonksiyonu
 * dinamik openGraph.images URL olusturur, sosyal medya crawler bu route'u
 * cagirir.
 */

export const runtime = 'edge'

let interBoldPromise: Promise<ArrayBuffer> | null = null

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const { origin, searchParams } = new URL(request.url)
  const title = searchParams.get('title') || 'Bilge Arena Yarışması'
  const score = searchParams.get('score')
  const category = searchParams.get('category')

  if (!interBoldPromise) {
    interBoldPromise = fetch(`${origin}/fonts/Inter-Bold.woff`).then((res) =>
      res.arrayBuffer(),
    )
  }
  const interBold = await interBoldPromise

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #0A0E1A 0%, #111827 50%, #0A0E1A 100%)',
          fontFamily: 'Inter',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)',
          }}
        />

        <div style={{ fontSize: 72, marginBottom: 24 }}>🏆</div>

        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            background: 'linear-gradient(90deg, #2563EB, #D97706)',
            backgroundClip: 'text',
            color: 'transparent',
            textAlign: 'center',
            lineHeight: 1.2,
            maxWidth: 900,
            padding: '0 40px',
          }}
        >
          {title}
        </div>

        {score && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              marginTop: 32,
            }}
          >
            <span
              style={{
                fontSize: 28,
                color: '#9CA3AF',
              }}
            >
              Skor:
            </span>
            <span
              style={{
                fontSize: 64,
                fontWeight: 900,
                color: '#10B981',
              }}
            >
              {score}
            </span>
          </div>
        )}

        {category && (
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#9CA3AF',
              marginTop: 16,
              textAlign: 'center',
            }}
          >
            {`Kategori: ${category}`}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 20,
            color: '#6B7280',
          }}
        >
          <span style={{ color: '#9CA3AF' }}>Oda:</span>
          <span style={{ fontWeight: 700, color: '#D97706' }}>{code}</span>
          <span style={{ color: '#374151', margin: '0 8px' }}>·</span>
          <span>bilgearena.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
      ],
    },
  )
}

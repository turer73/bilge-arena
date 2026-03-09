import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title') || 'Bilge Arena'
  const subtitle = searchParams.get('subtitle') || 'YKS Hazirlık Platformu'

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
          background: 'linear-gradient(135deg, #0A0E1A 0%, #111827 50%, #0A0E1A 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Glow efekti */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Logo emoji */}
        <div style={{ fontSize: 72, marginBottom: 24 }}>⚔️</div>

        {/* Title */}
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

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: '#9CA3AF',
            marginTop: 16,
            textAlign: 'center',
            maxWidth: 700,
          }}
        >
          {subtitle}
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 20,
            color: '#6B7280',
          }}
        >
          bilgearena.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}

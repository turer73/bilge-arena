'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Root layout hatalarini yakalar.
 * Normal error.tsx root layout'u kapsayamaz —
 * bu dosya o boslugu doldurur.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="tr">
      <body>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: '1.5rem',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: '3rem' }}>💥</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Kritik Hata</h1>
          <p style={{ maxWidth: '400px', fontSize: '0.875rem', color: '#888' }}>
            Uygulama beklenmeyen bir hatayla karsilasti. Lutfen sayfayi yeniden yukleyin.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '0.5rem',
              background: '#2563EB',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 'bold',
            }}
          >
            Sayfayi Yenile
          </button>
        </div>
      </body>
    </html>
  )
}

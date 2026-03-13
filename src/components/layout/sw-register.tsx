'use client'

import { useEffect } from 'react'

/**
 * Service Worker'i guvenli sekilde kaydeder.
 * next-pwa'nin otomatik register'i bazi mobil cihazlarda
 * unhandled rejection firlatiyordu. Bu bilesen hata yakalama ile
 * sessizce handle eder.
 */
export function SWRegister() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      // Sayfa tamamen yuklendikten sonra kaydet
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then(() => {
            // Basarili — sessiz devam
          })
          .catch(() => {
            // SW kaydedilemedi — kritik degil, sessizce devam et.
            // Bazi cihazlarda (eski Android, kisitli browser) olabilir.
          })
      })
    }
  }, [])

  return null
}

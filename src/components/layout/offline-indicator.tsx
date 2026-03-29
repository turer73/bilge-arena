'use client'

import { useState, useEffect } from 'react'

/**
 * Kullanici cevrimdisi oldugunda ust kisimda uyari gosterir.
 * Tekrar baglanti kurulunca otomatik kaybolur.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)

    // Baslangicta kontrol
    if (!navigator.onLine) setIsOffline(true)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[var(--urgency)] px-4 py-2 text-center text-sm font-medium text-white">
      <span className="mr-2">&#9888;</span>
      Internet baglantisi yok — cevrimdisi moddasin. Bazi ozellikler kisitli olabilir.
    </div>
  )
}

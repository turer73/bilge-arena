'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'

export function PaperPackQr({ packId }: { packId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [failed, setFailed] = useState(false)
  const answerPath = useMemo(() => `/arena/kagit/${packId}/cevap`, [packId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let active = true
    const answerUrl = new URL(answerPath, window.location.origin).toString()
    void QRCode.toCanvas(canvas, answerUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 184,
      color: { dark: '#111827', light: '#FFFFFF' },
    }).then(() => {
      if (active) setFailed(false)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => {
      active = false
    }
  }, [answerPath])

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Kağıt paketi cevap girişini açan QR kod"
        className="h-[184px] w-[184px] rounded-lg bg-white p-1"
      />
      {failed ? (
        <p role="alert" className="max-w-52 text-xs text-[var(--urgency)]">
          QR üretilemedi. Cevap girişini paket sayfasındaki bağlantıdan açabilirsin.
        </p>
      ) : (
        <p className="max-w-52 text-[11px] leading-4 text-[var(--text-sub)]">
          QR yalnız cevap sayfasının adresini taşır; soru veya cevap içermez.
        </p>
      )}
    </div>
  )
}

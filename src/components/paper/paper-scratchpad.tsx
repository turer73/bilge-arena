'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

const FALLBACK_WIDTH = 640
const FALLBACK_HEIGHT = 240

export function PaperScratchpad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasDrawing, setHasDrawing] = useState(false)

  const context = useCallback(() => canvasRef.current?.getContext('2d') ?? null, [])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.round((bounds.width || FALLBACK_WIDTH) * ratio))
    const height = Math.max(1, Math.round((bounds.height || FALLBACK_HEIGHT) * ratio))
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
    const drawingContext = canvas.getContext('2d')
    if (drawingContext) {
      drawingContext.scale(ratio, ratio)
      drawingContext.lineCap = 'round'
      drawingContext.lineJoin = 'round'
      drawingContext.lineWidth = 2.5
      drawingContext.strokeStyle = '#334155'
    }
    setHasDrawing(false)
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = point(event)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPointRef.current) return
    const next = point(event)
    const drawingContext = context()
    if (!drawingContext) return
    drawingContext.beginPath()
    drawingContext.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    drawingContext.lineTo(next.x, next.y)
    drawingContext.stroke()
    lastPointRef.current = next
    setHasDrawing(true)
  }

  const stop = () => {
    drawingRef.current = false
    lastPointRef.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    const drawingContext = context()
    if (!canvas || !drawingContext) return
    drawingContext.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawing(false)
  }

  return (
    <section aria-labelledby="paper-scratchpad-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="paper-scratchpad-title" className="text-sm font-bold text-[var(--text)]">Yerel karalama alanı</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
            Çizim yalnız bu cihazın belleğinde kalır; kaydedilmez ve sunucuya gönderilmez.
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={!hasDrawing}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          <Eraser className="h-4 w-4" aria-hidden="true" />
          Temizle
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        role="img"
        aria-label="İsteğe bağlı yerel karalama alanı; cevap girişi için gerekli değildir"
        className="h-60 w-full touch-none rounded-xl border border-dashed border-[var(--border)] bg-white shadow-inner"
      />
      <p className="mt-2 text-[11px] leading-4 text-[var(--text-sub)]">
        Klavyeyle cevap verenler bu alanı kullanmadan doğrudan seçenekleri işaretleyebilir.
      </p>
    </section>
  )
}

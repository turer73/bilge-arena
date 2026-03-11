'use client'

/**
 * Can kaybında kırmızı vignette flash efekti.
 * Ekranın kenarlarından kırmızı glow yayılır, hızla kaybolur.
 */
export function LifeLostOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 animate-lifeLostFlash"
      style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(239,68,68,0.35) 100%)',
      }}
    />
  )
}

'use client'

const COLORS = [
  'var(--reward)',
  'var(--growth)',
  'var(--focus)',
  'var(--wisdom)',
]

export function BurstParticles() {
  const particles = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * 360
    const distance = 35 + Math.random() * 25
    const px = Math.cos((angle * Math.PI) / 180) * distance
    const py = Math.sin((angle * Math.PI) / 180) * distance
    return { px, py, color: COLORS[i % 4] }
  })

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-30">
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full"
          style={{
            background: p.color,
            '--px': `${p.px}px`,
            '--py': `${p.py}px`,
            animation: `particle 0.6s ease-out ${i * 35}ms both`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

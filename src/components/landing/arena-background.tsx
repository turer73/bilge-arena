/** Arena arka plan efektleri — halkalar, grid, glow */
export function ArenaBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Halka sistemi — pulse-ring animasyonu */}
      {[500, 400, 300, 200].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 rounded-full border border-[var(--focus)]"
          style={{
            width: r,
            height: r,
            transform: 'translate(-50%, -50%)',
            opacity: [0.06, 0.1, 0.14, 0.18][i],
            animation: `pulse-ring ${3 + i}s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}

      {/* Merkez parlama */}
      <div
        className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: 'radial-gradient(circle, var(--focus-bg) 0%, transparent 70%)',
        }}
      />

      {/* Donen dis halka */}
      <div
        className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[var(--focus)]"
        style={{
          opacity: 0.12,
          animation: 'spin 30s linear infinite',
        }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(var(--focus-bg) 1px, transparent 1px), linear-gradient(90deg, var(--focus-bg) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          maskImage:
            'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
        }}
      />

      {/* Kose parlama */}
      <div
        className="absolute -right-[200px] -top-[200px] h-[600px] w-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--wisdom-bg) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute -bottom-[200px] -left-[200px] h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--focus-bg) 0%, transparent 60%)',
        }}
      />
    </div>
  )
}

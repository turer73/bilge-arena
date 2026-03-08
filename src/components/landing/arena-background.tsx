/** Arena arka plan efektleri — halkalar, grid, glow */
export function ArenaBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Halka sistemi — Template birebir: pulse-ring, #2563EB opacity hex */}
      {[500, 400, 300, 200].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: r,
            height: r,
            transform: 'translate(-50%, -50%)',
            border: `1px solid ${['#2563EB10', '#2563EB18', '#2563EB22', '#2563EB30'][i]}`,
            animation: `pulse-ring ${3 + i}s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}

      {/* Merkez parlama — Template: #2563EB18 */}
      <div
        className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: 'radial-gradient(circle, #2563EB18 0%, transparent 70%)',
        }}
      />

      {/* Donen dis halka — Template: spin-slow 30s */}
      <div
        className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full animate-spin-slow"
        style={{
          border: '1px dashed #2563EB20',
        }}
      />

      {/* Grid pattern — Template: #2563EB08 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(#2563EB08 1px, transparent 1px), linear-gradient(90deg, #2563EB08 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          maskImage:
            'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
        }}
      />

      {/* Köşe parlama — Template: purple.m 12, blue.m 10 */}
      <div
        className="absolute -right-[200px] -top-[200px] h-[600px] w-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #7C3AED12 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute -bottom-[200px] -left-[200px] h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #2563EB10 0%, transparent 60%)',
        }}
      />
    </div>
  )
}

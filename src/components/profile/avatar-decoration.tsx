import type { ReactNode } from 'react'

/**
 * Avatarın etrafına seçili süs(ler)i bindirir. ÇOKLU seçim: decorationIds dizisi
 * → tüm seçili süsler üst üste render (kanat + taç + aura aynı anda). children =
 * avatar (genelde ProfileFrameRing'li). Süs `pointer-events-none absolute` katman;
 * layout bozmaz, taşması serbest (üst kap overflow-hidden olmamalı).
 *
 * z-katmanlama: aura (behind) z-auto < avatar z-[1] < ön süsler z-[2].
 * Emoji + SVG (sıfır-asset). Animasyonlar globals.css keyframe'leri (float,
 * glow-pulse) + Tailwind animate-pulse.
 */
export function AvatarDecoration({
  decorationIds,
  size,
  children,
}: {
  decorationIds: string[] | null | undefined
  size: number
  children: ReactNode
}) {
  const ids = (decorationIds ?? []).filter((id) => id && id !== 'none')
  const layers = ids.map((id) => renderDecoration(id, size)).filter(Boolean) as DecoLayer[]
  const behinds = layers.map((l) => l.behind).filter(Boolean)
  const fronts = layers.map((l) => l.front).filter(Boolean)

  if (behinds.length === 0 && fronts.length === 0) return <>{children}</>

  return (
    <div className="relative inline-flex shrink-0">
      {behinds.map((b, i) => (
        <span key={`b${i}`}>{b}</span>
      ))}
      <span className="relative z-[1] inline-flex">{children}</span>
      {fronts.length > 0 && (
        <span className="pointer-events-none absolute inset-0 z-[2]">
          {fronts.map((f, i) => (
            <span key={`f${i}`}>{f}</span>
          ))}
        </span>
      )}
    </div>
  )
}

interface DecoLayer {
  behind?: ReactNode
  front?: ReactNode
}

/** Tüy katmanlı SVG melek kanadı (tek kanat; sağ için scaleX(-1) ile aynalanır). */
function Wing({ px }: { px: number }) {
  // Taban pivot (alt-orta) çevresinde yelpaze açılan yuvarlatılmış "tüy"ler.
  const feathers = [0, 1, 2, 3, 4]
  return (
    <svg
      width={px}
      height={px * 1.15}
      viewBox="0 0 40 46"
      fill="none"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
    >
      <g>
        {feathers.map((i) => (
          <rect
            key={i}
            x="17"
            y={6 + i * 1.5}
            width="6.5"
            height={30 - i * 4.5}
            rx="3.25"
            fill="#FFFFFF"
            stroke="#E6C766"
            strokeWidth="0.7"
            transform={`rotate(${-6 - i * 17} 20 40)`}
          />
        ))}
      </g>
    </svg>
  )
}

function renderDecoration(id: string, size: number): DecoLayer | null {
  const em = Math.max(13, Math.round(size * 0.44)) // emoji süs boyutu
  const wingPx = Math.round(size * 0.82)

  switch (id) {
    case 'aura':
      return {
        behind: (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1.5 rounded-full"
            style={{
              background: 'radial-gradient(circle, var(--reward) 0%, transparent 68%)',
              filter: 'blur(6px)',
              animation: 'glow-pulse 2.6s ease-in-out infinite',
            }}
          />
        ),
      }

    case 'sparkle':
      return {
        front: (
          <>
            {[
              { top: '-12%', left: '-8%' },
              { top: '78%', left: '-12%' },
              { top: '-10%', left: '86%' },
              { top: '82%', left: '84%' },
            ].map((p, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute animate-pulse"
                style={{ top: p.top, left: p.left, fontSize: em * 0.5, animationDelay: `${i * 0.35}s` }}
              >
                ✨
              </span>
            ))}
          </>
        ),
      }

    case 'konfeti':
      return {
        front: (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 animate-pulse"
            style={{ top: -em * 0.55, transform: 'translateX(-50%)', fontSize: em * 0.7 }}
          >
            🎉
          </span>
        ),
      }

    case 'kanat':
      // SVG tüy-kanat (emoji 🪽 yerine — küçük/tutarsız görünüyordu). Statik konum/
      // aynalama DIŞ span'de, float İÇ span'de (float transform'u ezmesin).
      return {
        front: (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: -wingPx * 0.72, top: size * 0.04 }}
            >
              <span style={{ display: 'block', animation: 'float 3.2s ease-in-out infinite' }}>
                <Wing px={wingPx} />
              </span>
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ right: -wingPx * 0.72, top: size * 0.04, transform: 'scaleX(-1)' }}
            >
              <span style={{ display: 'block', animation: 'float 3.2s ease-in-out infinite' }}>
                <Wing px={wingPx} />
              </span>
            </span>
          </>
        ),
      }

    case 'crown':
      return {
        front: (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2"
            style={{ top: -em * 0.58, transform: 'translateX(-50%)' }}
          >
            <span style={{ display: 'block', fontSize: em, animation: 'float 3.4s ease-in-out infinite' }}>👑</span>
          </span>
        ),
      }

    case 'alev':
      return {
        front: (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute animate-pulse"
              style={{ left: -em * 0.32, top: size * 0.5, fontSize: em * 0.62 }}
            >
              🔥
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute animate-pulse"
              style={{ right: -em * 0.32, top: size * 0.5, fontSize: em * 0.62, animationDelay: '0.3s' }}
            >
              🔥
            </span>
          </>
        ),
      }

    default:
      return null
  }
}

import type { ReactNode } from 'react'

/**
 * Avatarın etrafına seçili süsü bindirir. children = avatar (genelde
 * ProfileFrameRing ile sarılı). Süs `pointer-events-none absolute` katman;
 * layout'u bozmaz, taşması serbest (üst kap overflow-hidden olmamalı).
 * id='none' → süs yok, children aynen döner.
 *
 * Emoji + CSS (sıfır-asset). Animasyonlar globals.css'teki mevcut keyframe'leri
 * kullanır (float, glow-pulse) + Tailwind animate-pulse.
 */
export function AvatarDecoration({
  decorationId,
  size,
  children,
}: {
  decorationId: string | null | undefined
  size: number
  children: ReactNode
}) {
  const id = decorationId ?? 'none'
  const deco = renderDecoration(id, size)
  if (!deco) return <>{children}</>
  // z-katmanlama (Codex P2): aura `behind` z-auto kalır; avatar açık z-[1] ile
  // ÜSTÜNDE (çerçevesiz/konumlanmamış avatarda aura örtmesini önler); ön süsler
  // z-[2] ile en üstte.
  return (
    <div className="relative inline-flex shrink-0">
      {deco.behind}
      <span className="relative z-[1] inline-flex">{children}</span>
      {deco.front && <span className="pointer-events-none absolute inset-0 z-[2]">{deco.front}</span>}
    </div>
  )
}

function renderDecoration(
  id: string,
  size: number,
): { behind?: ReactNode; front?: ReactNode } | null {
  const em = Math.max(13, Math.round(size * 0.44)) // süs emoji boyutu

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
      return {
        front: (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: -em * 0.6, top: size * 0.1, fontSize: em, animation: 'float 3s ease-in-out infinite' }}
            >
              🪽
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ right: -em * 0.6, top: size * 0.1, transform: 'scaleX(-1)' }}
            >
              {/* Statik aynalama DIŞ span'de; float İÇ span'de (float scaleX'i ezmesin) */}
              <span style={{ display: 'block', fontSize: em, animation: 'float 3s ease-in-out infinite' }}>🪽</span>
            </span>
          </>
        ),
      }

    case 'crown':
      // Statik transform (ortalama) DIŞ span'de; float animasyonu (transform'u
      // ezer) İÇ span'de — yoksa float translateX(-50%)'i silip tacı sağa kaydırır.
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

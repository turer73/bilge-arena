import type { ReactNode } from 'react'
import { getNameplateById } from '@/lib/constants/profile-nameplates'

/**
 * İsmin arkasına seçili nameplate panelini uygular. id='none' ise panel
 * çizilmez (düz isim). Seçim DB'de (selected_nameplate) doğrulanmış olduğu için
 * ek sahiplik guard'ı gerekmez — sıralama/düelloda başkalarının seçimi de bu
 * komponentle render edilir.
 */
export function Nameplate({
  nameplateId,
  children,
  className = '',
}: {
  nameplateId: string | null | undefined
  children: ReactNode
  className?: string
}) {
  const np = getNameplateById(nameplateId)
  if (np.id === 'none') return <>{children}</>
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 ${np.animClass ?? ''} ${className}`}
      style={{ background: np.css, color: np.textColor }}
    >
      {children}
    </span>
  )
}

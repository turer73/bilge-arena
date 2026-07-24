'use client'

import { ComponentErrorBoundary } from '@/components/ui/error-boundary'
import { DailyLoginChecker } from '@/components/game/daily-login-checker'

/**
 * Arena layout'un yardımcı bileşenlerini izole error boundary'lerle sarar.
 * DailyLoginChecker çökerse ana sayfa içeriği etkilenmez.
 *
 * NOT: Bilge Asistan (ChatWidget) global FAB olarak buradan kaldırıldı —
 * artık yalnızca /arena/calisma hub'ında inline (bkz. study-assistant.tsx)
 * yaşıyor; global FAB ile Bilge Çan'ın (soru-içi Sokratik koç) pedagojik
 * çelişkisini önlemek için (Turgut kararı, konu#7 ders-hub planı).
 */
export function ArenaAuxiliaries() {
  return (
    <ComponentErrorBoundary label="Günlük Giriş" variant="minimal">
      <DailyLoginChecker />
    </ComponentErrorBoundary>
  )
}

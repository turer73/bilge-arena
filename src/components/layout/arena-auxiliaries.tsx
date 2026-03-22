'use client'

import { ComponentErrorBoundary } from '@/components/ui/error-boundary'
import { ChatWidget } from '@/components/chat/chat-widget'
import { DailyLoginChecker } from '@/components/game/daily-login-checker'

/**
 * Arena layout'un yardımcı bileşenlerini izole error boundary'lerle sarar.
 * ChatWidget veya DailyLoginChecker çökerse ana sayfa içeriği etkilenmez.
 */
export function ArenaAuxiliaries() {
  return (
    <>
      <ComponentErrorBoundary label="Sohbet" variant="minimal">
        <ChatWidget />
      </ComponentErrorBoundary>
      <ComponentErrorBoundary label="Günlük Giriş" variant="minimal">
        <DailyLoginChecker />
      </ComponentErrorBoundary>
    </>
  )
}

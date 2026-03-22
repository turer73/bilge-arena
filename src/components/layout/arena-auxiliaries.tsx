'use client'

import dynamic from 'next/dynamic'
import { ComponentErrorBoundary } from '@/components/ui/error-boundary'
import { DailyLoginChecker } from '@/components/game/daily-login-checker'

// ChatWidget lazy-load + ssr: false — client-only, agir AI chat bundle'i ayri chunk'a
const ChatWidget = dynamic(
  () => import('@/components/chat/chat-widget').then(m => ({ default: m.ChatWidget })),
  { ssr: false },
)

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

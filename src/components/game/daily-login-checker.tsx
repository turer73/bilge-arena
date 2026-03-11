'use client'

import { useDailyLogin } from '@/lib/hooks/use-daily-login'

/**
 * Günlük giriş ödülünü kontrol eden görünmez bileşen.
 * Arena layout'una eklendiğinde bir kez çalışır.
 */
export function DailyLoginChecker() {
  useDailyLogin()
  return null
}

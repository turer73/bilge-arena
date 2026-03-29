'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { refreshProfile } from '@/lib/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { playSound } from '@/lib/utils/sounds'

/**
 * Günlük giriş ödülü hook'u.
 * Kullanıcı giriş yaptığında bir kez çalışır.
 * API'den XP ödülü alır ve toast gösterir.
 */
export function useDailyLogin() {
  const { user } = useAuthStore()
  const claimedRef = useRef(false)

  useEffect(() => {
    if (!user || claimedRef.current) return
    claimedRef.current = true

    fetch('/api/daily-login', { method: 'POST' })
      .then((r) => r.ok ? r.json() : null)
      .then(async (data) => {
        if (!data) return

        if (data.status === 'claimed' || data.status === 'streak_reset') {
          // Profili güncelle (yeni XP'yi yansıt)
          await refreshProfile()

          // Toast göster
          playSound('xp')
          toast.success(
            `🌅 Günlük Giriş +${data.xpAwarded} XP`,
            data.streak >= 7
              ? `🔥 ${data.streak} gün seri! Maksimum ödül!`
              : `${data.streak}. gün serisi! Yarın gel +${Math.min((data.streak + 1) * 10, 70)} XP kazan`
          )

          // Streak milestone kutlamasi
          const milestones: Record<number, string> = {
            5: '5 gun seri! Disiplin gosterdun!',
            10: '10 gun seri! Azimli bir ogrencisin!',
            30: '30 gun seri! Efsane! Kimse seni durduramaz!',
            50: '50 gun seri! Gercek bir sampiyon!',
            100: '100 gun seri! Efsaneler arasina girdin!',
          }
          if (milestones[data.streak]) {
            setTimeout(() => {
              playSound('level_up')
              toast.success(`🏆 Seri Basarimi!`, milestones[data.streak])
            }, 1500)
          }

          if (data.status === 'streak_reset') {
            toast.info(
              'Seri sıfırlandı',
              'Yeni seriye başladın! Her gün gel, ödüller artsın.'
            )
          }
        }
        // 'already_claimed' durumunda bir şey gösterme
      })
      .catch(() => {})
  }, [user])
}

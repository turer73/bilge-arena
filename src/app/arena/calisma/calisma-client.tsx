'use client'

import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { defaultExamRefForType } from '@/lib/constants/exam-types'
import { BilgeChan } from '@/components/ui/bilge-chan'
import { TodayPlanFocus } from '@/components/study/today-plan-focus'
import { MasteryActionCard } from '@/components/study/mastery-action-card'

/**
 * Ders Çalışma Ortamı (öğrenme hub'ı) — /arena/calisma.
 *
 * Tek-sütun, sakin, tek-odak yerleşim (kritik tasarım kararı #3): üstte TEK
 * belirgin "Bugünün 15'i" CTA'sı, altında ikincil aksiyon-kartı (mastery),
 * en altta lazy-load inline Bilge Asistan (Faz 2'de eklenir). Rozet/liderlik
 * YOK — yalnız öz-referanslı ilerleme (kritik tasarım kararı #6).
 */
export default function CalismaClient() {
  const { user, profile, loading } = useAuthStore()
  const gameStore = useGameStore()

  // Hub tek bir "game" baglaminda calisir — kullanici daha once bir oyun
  // secmisse (gameStore.selectedGame, onboarding/lobby'den) onu, yoksa
  // varsayilan olarak 'matematik'i kullanir (GAMES kaydinin ilk/ana dersi).
  const game = gameStore.selectedGame ?? 'matematik'
  const examRef = gameStore.selectedExamRef ?? defaultExamRefForType(profile?.exam_type)

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-[var(--text-sub)]">
        Yükleniyor...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="mb-2 text-xl font-bold">Giriş Yapmanız Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">
          Ders çalışma ortamına erişmek için giriş yap.
        </p>
        <Link
          href="/giris"
          className="btn-primary inline-block rounded-[10px] px-8 py-3 font-display text-sm font-bold tracking-wider"
        >
          Giriş Yap
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-6 md:max-w-lg md:py-8">
      <div className="flex animate-fadeUp items-center gap-3">
        <BilgeChan pose="reading" height={64} />
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">Ders Çalışma Ortamı</h1>
          <p className="text-[11px] text-[var(--text-sub)]">
            Bugün ne çalışmalıyım, birlikte bakalım.
          </p>
        </div>
      </div>

      <TodayPlanFocus game={game} userId={user.id} examRef={examRef} />
      <MasteryActionCard game={game} userId={user.id} examRef={examRef} />
    </div>
  )
}

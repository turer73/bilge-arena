'use client'

import { useRouter } from 'next/navigation'
import type { GameSlug } from '@/lib/constants/games'
import { useMasteryMap } from '@/lib/hooks/use-mastery-map'
import { useGameStore } from '@/stores/game-store'
import { MasteryMapCard } from '@/components/game/mastery-map-card'

interface MasteryActionCardProps {
  game: GameSlug
  userId?: string | null
  examRef?: string | null
}

/**
 * Aksiyon-odaklı mastery kartı — opak-yüzde yerine "en zayıf kazanımdan pratik
 * yap" CTA'sı (araştırma 1: dashboard'u eyleme-çevir, opak-skor değil).
 *
 * Görsel gösterim mevcut MasteryMapCard'ı (değiştirilmeden) tekrar kullanır —
 * sadece en-zayıf-kazanım seçimi + CTA bu sarmalayıcıda. "5 soru" ifadesi
 * kopyada hedef niyeti anlatır; sunulan pratik oturumu mevcut oyun/kategori
 * filtresiyle başlar (yeni bir "tam 5 soru" backend/endpoint'i plan kapsamında
 * değil — KISIT#7, aşırı mühendislik yok).
 */
export function MasteryActionCard({ game, userId, examRef }: MasteryActionCardProps) {
  const router = useRouter()
  const gameStore = useGameStore()
  const { outcomes, loading } = useMasteryMap(game, userId, examRef)

  if (!userId || loading || outcomes.length === 0) return null

  const weakest = outcomes
    .filter((o) => o.status !== 'mastered')
    .sort((a, b) => a.accuracy - b.accuracy)[0]

  if (!weakest) {
    return (
      <div className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.34s', animationFillMode: 'both' }}>
        <div className="px-4 py-4 text-center text-[11px] text-[var(--text-sub)]">
          🎉 Şu an takip edilen kazanımların hepsinde ustalaştın.
        </div>
      </div>
    )
  }

  const handlePractice = () => {
    gameStore.setGame(weakest.game as GameSlug)
    gameStore.setCategory(weakest.category)
    gameStore.setExamRef(weakest.examRef)
    gameStore.setMode('practice')
    router.push(`/arena/${weakest.game}`)
  }

  return (
    <div className="space-y-2">
      <MasteryMapCard outcomes={[weakest]} loading={false} />
      <button
        onClick={handlePractice}
        className="btn-primary w-full rounded-[10px] py-2 text-xs font-bold tracking-wide transition-transform hover:scale-[1.02]"
      >
        🎯 En Zayıf Kazanımdan 5 Soru Çöz
      </button>
    </div>
  )
}

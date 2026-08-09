'use client'

import { useRouter } from 'next/navigation'
import type { GameSlug } from '@/lib/constants/games'
import { useTodayPlan } from '@/lib/hooks/use-today-plan'
import { TodayPlanCard } from '@/components/game/today-plan-card'
import { isPaperModeUiEnabled, paperPackCreateHref } from '@/lib/paper-mode/client'

interface TodayPlanFocusProps {
  game: GameSlug
  userId?: string | null
  examRef?: string | null
  selectedCategory?: string | null
}

/**
 * Ders çalışma hub'ının TEK-ODAK CTA'sı — retrieval varsayılan-akış (araştırma 1:
 * "Bugün ne çalışmalıyım" tek-odak CTA, Sunsama günlük-planlama deseni).
 *
 * Görsel dil mevcut TodayPlanCard (quiz-engine lobisiyle aynı) — yeni bileşen
 * icat etmek yerine tekrar kullanılır. onStart burada quiz-engine akışını
 * DOĞRUDAN başlatmaz (hub sayfası quiz state'inden bağımsız) — ilgili oyunun
 * sayfasına yönlendirir; orada aynı plan zaten quiz-engine tarafından çekilip
 * gösterilir ve gerçek "Başlat" orada olur. Cross-page plan-state taşıma gibi
 * yeni bir mekanizma icat etmekten kaçınır (KISIT#7 — aşırı mühendislik yok).
 */
export function TodayPlanFocus({ game, userId, examRef, selectedCategory }: TodayPlanFocusProps) {
  const router = useRouter()
  const { plan, loading } = useTodayPlan(game, userId, examRef, selectedCategory)

  if (!userId) return null

  // Plan boş (yetersiz soru havuzu vb.) — TodayPlanCard sessizce null döner,
  // ama hub'ın tek-odak alanı boş kalmamalı (plandaki empty-state kuralı).
  if (!loading && (!plan || plan.questions.length === 0)) {
    return (
      <div className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.28s', animationFillMode: 'both' }}>
        <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
          <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            BUGÜNÜN 15&apos;İ
          </span>
        </div>
        <div className="px-4 py-5 text-center">
          <p className="mb-3 text-[12px] leading-relaxed text-[var(--text-sub)]">
            Bugün için hazır bir plan yok. Derse başlayarak ilk planını oluştur.
          </p>
          <button
            onClick={() => router.push(`/arena/${game}`)}
            className="btn-primary rounded-[10px] px-6 py-2.5 text-xs font-bold tracking-wide transition-transform hover:scale-[1.02]"
          >
            📝 İlk Planını Oluştur
          </button>
        </div>
      </div>
    )
  }

  return (
    <TodayPlanCard
      plan={plan}
      loading={loading}
      onStart={() => router.push(`/arena/${game}`)}
      paperHref={isPaperModeUiEnabled() && plan
        ? paperPackCreateHref(game, plan.examRef ?? examRef)
        : null}
    />
  )
}

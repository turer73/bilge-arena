'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MasteryGraph } from '@/components/study/mastery-graph'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { defaultExamRefForType } from '@/lib/constants/exam-types'
import { useMasteryMap } from '@/lib/hooks/use-mastery-map'
import type { MasteryOutcomePublic } from '@/lib/mastery/public-contract'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'

export default function HakimiyetClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading: authLoading } = useAuthStore()
  const gameStore = useGameStore()

  const requestedGame = searchParams.get('game')
  const requestedGameIsValid = requestedGame !== null
    && Object.prototype.hasOwnProperty.call(GAMES, requestedGame)
  const invalidRequestedGame = requestedGame !== null && !requestedGameIsValid
  const game: GameSlug = requestedGameIsValid
    ? requestedGame as GameSlug
    : gameStore.selectedGame ?? 'matematik'
  const requestedExamRef = searchParams.get('exam_ref')?.trim().toUpperCase() || null
  const examRef = requestedExamRef
    ?? gameStore.selectedExamRef
    ?? defaultExamRefForType(profile?.exam_type)
  // An explicit invalid game must not trigger a fallback mastery request.
  // Keep the hook unconditional, but remove the user id so no wrong-scope
  // graph is fetched while the fail-safe state is rendered below.
  const mastery = useMasteryMap(game, invalidRequestedGame ? null : user?.id, examRef)

  const handlePractice = (outcome: MasteryOutcomePublic) => {
    gameStore.setGame(outcome.game as GameSlug)
    gameStore.setCategory(outcome.category)
    // Wordquest'in mastery display ref'i YDT, soru storage ref'i NULL'dir.
    // Onceki dersin paylasilan sinav tercihini pratik CTA'si silmemeli.
    if (outcome.game !== 'wordquest') gameStore.setExamRef(outcome.examRef)
    gameStore.setDifficulty(null)
    gameStore.setMode('practice')
    router.push(`/arena/${outcome.game}`)
  }

  if (authLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">Yükleniyor...</div>
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="mb-2 text-xl font-bold">Giriş Yapmanız Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">Hâkimiyet haritan yalnızca sana özel kanıtları gösterir.</p>
        <Link href="/giris" className="btn-primary inline-block rounded-[10px] px-8 py-3 text-sm font-bold">
          Giriş Yap
        </Link>
      </div>
    )
  }

  if (invalidRequestedGame) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[var(--text)]">Geçersiz harita kapsamı</h1>
        <p className="mt-2 text-sm text-[var(--text-sub)]">
          Ders kapsamı tanınamadı. Yayınlanmış bir ders bağlantısı açmayı deneyin.
        </p>
        <Link href="/arena/calisma" className="mt-5 inline-flex text-xs font-bold text-[var(--focus)] hover:underline">
          Çalışmaya dön
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6 md:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--text-sub)]">ÖĞRENME KANITLARIM</p>
          <h1 className="mt-1 text-xl font-bold text-[var(--text)]">Hâkimiyet Haritam</h1>
        </div>
        <Link href="/arena/calisma" className="text-xs font-bold text-[var(--focus)] hover:underline">
          Çalışma ortamına dön
        </Link>
      </div>

      {mastery.loading ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-8 text-center text-xs text-[var(--text-sub)]">
          Kazanım kanıtların yükleniyor...
        </div>
      ) : mastery.response ? (
        <MasteryGraph
          graph={mastery.graph}
          coverage={mastery.coverage}
          discovery={mastery.discovery}
          outcomes={mastery.outcomes}
          onPractice={handlePractice}
        />
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-8 text-center text-xs text-[var(--text-sub)]">
          Hâkimiyet haritası şu an yüklenemedi. Biraz sonra yeniden deneyebilirsin.
        </div>
      )}
    </main>
  )
}

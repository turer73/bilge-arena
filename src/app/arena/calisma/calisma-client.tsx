'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { defaultExamRefForType, gamesForExamType } from '@/lib/constants/exam-types'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { BilgeChan } from '@/components/ui/bilge-chan'
import { TodayPlanFocus } from '@/components/study/today-plan-focus'
import { MasteryActionCard } from '@/components/study/mastery-action-card'
import { StudyContextSelector } from '@/components/study/study-context-selector'
import { StudyAssistantLauncher } from '@/components/study/study-assistant-launcher'
import { InstitutionWeeklyProgramCard } from '@/components/study/institution-weekly-program-card'
import { BookOpenCheck, ChevronRight, Clock3, Settings2, Sparkles, Target } from 'lucide-react'

const MOBILE_APP_SHELL_STYLE = '@media (max-width: 767px) { [data-app-navbar] { display: none !important; } [data-arena-main] { padding-top: 0 !important; } }'

function examRefsForGame(game: GameSlug, examType: string | null | undefined): string[] {
  const refs = [...GAMES[game].examTags]
  if (examType === 'lgs') return refs.filter((ref) => ref === 'LGS')
  if (examType === 'yks') return refs.filter((ref) => ref !== 'LGS')
  return refs
}

export default function CalismaClient() {
  const { user, profile, loading } = useAuthStore()
  const gameStore = useGameStore()

  const availableGames = useMemo(
    () => gamesForExamType(profile?.exam_type),
    [profile?.exam_type],
  )
  const fallbackGame = availableGames.find((item) => item.slug === 'matematik') ?? availableGames[0]
  const game = availableGames.some((item) => item.slug === gameStore.selectedGame)
    ? (gameStore.selectedGame as GameSlug)
    : fallbackGame.slug
  const examRefs = useMemo(
    () => examRefsForGame(game, profile?.exam_type),
    [game, profile?.exam_type],
  )
  const profileDefaultExamRef = defaultExamRefForType(profile?.exam_type)
  const examRef = gameStore.selectedExamRef && examRefs.includes(gameStore.selectedExamRef)
    ? gameStore.selectedExamRef
    : profileDefaultExamRef && examRefs.includes(profileDefaultExamRef)
      ? profileDefaultExamRef
      : examRefs[0] ?? null

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[var(--app-bg)] px-4 py-24 text-center text-sm font-bold text-[var(--app-text-sub)]" role="status">
        <style>{MOBILE_APP_SHELL_STYLE}</style>
        Çalışma planın hazırlanıyor...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-[var(--app-bg)] px-4 py-20 text-center text-[var(--app-text)]">
        <style>{MOBILE_APP_SHELL_STYLE}</style>
        <div className="mx-auto max-w-sm rounded-[26px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-6 shadow-[0_6px_0_var(--app-border)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-2xl" aria-hidden="true">🔒</div>
        <h1 className="mb-2 text-xl font-black">Giriş Yapman Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--app-text-sub)]">
          Ders çalışma ortamındaki kişisel planını görmek için giriş yap.
        </p>
        <Link
          href="/giris"
          className="inline-flex min-h-12 items-center rounded-2xl bg-[var(--app-accent)] px-8 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
        >
          Giriş Yap
        </Link>
        </div>
      </div>
    )
  }

  const handleGameChange = (nextGame: GameSlug) => {
    const nextExamRefs = examRefsForGame(nextGame, profile?.exam_type)
    const nextDefault = defaultExamRefForType(profile?.exam_type)
    const nextExamRef = examRef && nextExamRefs.includes(examRef)
      ? examRef
      : nextDefault && nextExamRefs.includes(nextDefault)
        ? nextDefault
        : nextExamRefs[0] ?? null

    gameStore.setGame(nextGame)
    gameStore.setCategory(null)
    gameStore.setExamRef(nextExamRef)
  }

  const handleExamRefChange = (nextExamRef: string) => {
    gameStore.setExamRef(nextExamRef)
    gameStore.setCategory(null)
  }

  return (
    <div data-practice-screen className="min-h-[100dvh] w-full min-w-0 touch-pan-y overflow-x-clip bg-[var(--app-bg)] pb-6 text-[var(--app-text)] md:bg-transparent md:pb-10">
      <style>{MOBILE_APP_SHELL_STYLE}</style>

      <header className="sticky inset-x-0 top-0 z-30 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)]/95 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:h-auto md:px-6 md:pb-5 md:pt-8 xl:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent-text)] md:h-12 md:w-12">
              <BookOpenCheck size={22} strokeWidth={2.8} />
            </span>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Çalışma merkezi</p>
              <h1 className="text-lg font-black leading-5 md:text-2xl">Pratik</h1>
            </div>
          </div>
          <Link href="/arena/profil" aria-label="Çalışma ayarları" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-transparent text-[var(--app-text-muted)] active:border-[var(--app-border)] active:bg-[var(--app-hover)]">
            <Settings2 size={21} strokeWidth={2.5} />
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-6xl px-3 pt-3 md:px-6 md:pt-0 xl:px-8">
        <section aria-labelledby="practice-hero-title" className="relative min-h-[168px] min-w-0 overflow-hidden rounded-[26px] bg-gradient-to-br from-[var(--app-accent)] to-[var(--app-accent-strong)] p-4 text-white shadow-[0_6px_0_var(--app-shadow-accent)] md:min-h-[176px] md:p-6">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full border-[26px] border-white/10" />
          <div className="relative z-10 min-w-0 pr-24 md:max-w-[72%] md:pr-0">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/75"><Sparkles size={14} /> Bugünün odağı</p>
            <h2 id="practice-hero-title" className="mt-2 text-xl font-black leading-6 md:text-2xl">Küçük bir adım seç, hemen başla.</h2>
            <p className="mt-1.5 text-xs font-semibold leading-5 text-white/80">Dersini seç; günlük planın ve sıradaki en iyi adımın önüne gelsin.</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black">
              <span className="rounded-lg bg-black/15 px-2 py-1">{examRef ?? 'Serbest'}</span>
              <span className="rounded-lg bg-black/15 px-2 py-1">{GAMES[game].name}</span>
              <span className="rounded-lg bg-black/15 px-2 py-1"><Clock3 size={11} className="mr-1 inline" />15 dk</span>
            </div>
          </div>
          <div className="absolute -bottom-7 -right-1 h-[148px] w-[112px] overflow-hidden md:right-5 md:w-[130px]">
            <BilgeChan pose="reading" height={172} />
          </div>
        </section>

        <div className="mt-4">
          <StudyContextSelector
            games={availableGames}
            selectedGame={game}
            examRefs={examRefs}
            selectedExamRef={examRef}
            onGameChange={handleGameChange}
            onExamRefChange={handleExamRefChange}
          />
        </div>

        <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-6">
          <section aria-label="Çalışma planın" className="min-w-0 space-y-4">
            <TodayPlanFocus
              game={game}
              userId={user.id}
              examRef={examRef}
              selectedCategory={null}
            />
            <Link href={`/arena/${game}`} className="flex min-h-16 min-w-0 items-center gap-3 rounded-[22px] border-2 border-[var(--app-success-border)] bg-[var(--app-card)] px-3.5 py-2.5 shadow-[0_4px_0_var(--app-success-border)] active:translate-y-0.5 sm:px-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-success-tint)] text-[var(--app-success)]"><Target size={21} strokeWidth={2.8} /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-black">Serbest pratik</span><span className="block text-[10px] font-semibold leading-4 text-[var(--app-text-sub)]">Kendi modunu ve konunu seç</span></span>
              <ChevronRight size={19} className="text-[var(--app-text-muted)]" strokeWidth={3} />
            </Link>
            <MasteryActionCard game={game} userId={user.id} examRef={examRef} />
            <InstitutionWeeklyProgramCard />
          </section>

          <aside className="min-w-0 lg:sticky lg:top-[calc(var(--navbar-h)+1.5rem)]">
            <StudyAssistantLauncher game={game} examRef={examRef} />
          </aside>
        </div>
      </div>
    </div>
  )
}

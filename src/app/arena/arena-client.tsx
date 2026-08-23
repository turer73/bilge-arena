'use client'

import { useEffect, useMemo, useState } from 'react'
import { MobileHomeDemo, type MobileSubjectId } from '@/app/mobil-demo/mobile-home-demo'
import { gamesForExamType } from '@/lib/constants/exam-types'
import { useDailyQuests } from '@/lib/hooks/use-daily-quests'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'

/**
 * Arena ana ekraninin tek, duyarli kabugu.
 *
 * Mobil, tablet ve masaustu artik ayni ogrenme yolu veri modelini ve ayni
 * eylemleri kullanir. Genis ekran icin ayri bir eski lobi render etmek yerine
 * MobileHomeDemo kendi breakpoint'lerinde iki sutunlu calisma alanina doner.
 */
export default function ArenaClient() {
  const { user, profile } = useAuthStore()
  const selectedExamRef = useGameStore((state) => state.selectedExamRef)
  const { quests } = useDailyQuests()
  const [institutionVisible, setInstitutionVisible] = useState(false)

  const classroomEnabled = process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED === 'true'
  const institutionEnabled = process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED === 'true'

  useEffect(() => {
    if (!institutionEnabled) return
    const controller = new AbortController()
    fetch('/api/institution/workspace', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setInstitutionVisible(response.ok)
      })
      .catch(() => {
        if (!controller.signal.aborted) setInstitutionVisible(false)
      })
    return () => controller.abort()
  }, [institutionEnabled, user?.id])

  const availableSubjects = useMemo(
    () => gamesForExamType(profile?.exam_type).map((game) =>
      (game.slug === 'wordquest' ? 'ingilizce' : game.slug) as MobileSubjectId,
    ),
    [profile?.exam_type],
  )
  const questionGoal = quests.find((quest) => quest.quest?.quest_type === 'correct_answers')

  return (
    <MobileHomeDemo
      mode="live"
      examLabel={profile?.exam_type === 'lgs' ? 'LGS' : 'YKS'}
      examRef={selectedExamRef ?? (profile?.exam_type === 'lgs' ? 'LGS' : 'TYT')}
      availableSubjects={availableSubjects}
      currentStreak={profile?.current_streak ?? 0}
      coinBalance={profile?.coin_balance ?? 0}
      totalXP={profile?.total_xp ?? 0}
      displayName={profile?.username || profile?.display_name || 'Arenacı'}
      dailyGoal={questionGoal?.quest ? {
        current: questionGoal.current_value,
        target: questionGoal.quest.target_value,
      } : null}
      classroomEnabled={classroomEnabled}
      institutionEnabled={institutionVisible}
      showBottomNav={false}
      userId={user?.id ?? null}
    />
  )
}

import type { GameSlug } from '@/lib/constants/games'
import { trackEvent } from '@/lib/utils/plausible'

export type LearningEventName =
  | 'LearningPlanStarted'
  | 'LearningPlanCompleted'
  | 'DueReviewCompleted'
  | 'DelayedCorrectnessObserved'
  | 'OutcomeStatusVerified'
  | 'CoachStageViewed'
  | 'CoachTransferResult'

export type LearningResult = 'correct' | 'incorrect' | 'skipped'
export type CoachStage = 'hint1' | 'hint2' | 'hint3' | 'solution'

export interface LearningEventPayloads {
  LearningPlanStarted: {
    game: GameSlug
    planSize: number
    completedBefore: number
    examRef: string | null
  }
  LearningPlanCompleted: {
    game: GameSlug
    answeredCount: number
    correctCount: number
    accuracyPercent: number
  }
  DueReviewCompleted: {
    game: GameSlug
    result: LearningResult
    overdueBucket: 'due_today' | '1_7d' | '8_30d' | '31d_plus'
  }
  DelayedCorrectnessObserved: {
    game: GameSlug
    result: 'correct' | 'incorrect'
    delayBucket: '1_6d' | '7_29d' | '30d_plus'
  }
  OutcomeStatusVerified: {
    game: GameSlug
    status: 'insufficient' | 'developing' | 'mastered'
    evidenceCount: number
  }
  CoachStageViewed: {
    game: GameSlug
    stage: CoachStage
    result: 'shown' | 'error'
  }
  CoachTransferResult: {
    game: GameSlug
    result: LearningResult
    coachDepth: 0 | 1 | 2 | 3 | 4
    timing: 'same_session' | 'next_session' | 'later'
  }
}

type AnalyticsProps = Record<string, string | number | boolean>

const GAMES = new Set<GameSlug>(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal'])
const EXAM_REFS = new Set(['TYT', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT', 'LGS'])
const RESULTS = new Set<LearningResult>(['correct', 'incorrect', 'skipped'])
const COACH_STAGES = new Set<CoachStage>(['hint1', 'hint2', 'hint3', 'solution'])
const OVERDUE_BUCKETS = new Set(['due_today', '1_7d', '8_30d', '31d_plus'])
const DELAY_BUCKETS = new Set(['1_6d', '7_29d', '30d_plus'])
const OUTCOME_STATUSES = new Set(['insufficient', 'developing', 'mastered'])
const TRANSFER_TIMINGS = new Set(['same_session', 'next_session', 'later'])

function isGame(value: unknown): value is GameSlug {
  return typeof value === 'string' && GAMES.has(value as GameSlug)
}

function count(value: unknown, max = 100): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.trunc(value)))
}

function percent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function examScope(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none'
  if (typeof value !== 'string') return 'other'
  const normalized = value.trim().toUpperCase()
  return EXAM_REFS.has(normalized) ? normalized : 'other'
}

function evidenceBucket(value: unknown): string {
  const evidence = count(value, 10_000)
  if (evidence < 3) return '0_2'
  if (evidence < 5) return '3_4'
  if (evidence < 10) return '5_9'
  return '10_plus'
}

function emit(name: LearningEventName, props: AnalyticsProps | null): void {
  if (!props) return
  trackEvent(name, { props })
}

/**
 * Learning analytics privacy boundary.
 *
 * Callers provide a typed payload, but this function still rebuilds every
 * outgoing object from a closed allowlist. Runtime-only extra fields such as
 * email, userId, questionId, selectedOption, answer, prompt or token are never
 * forwarded to Plausible. Free-form text is deliberately absent from every
 * learning event contract.
 */
export function trackLearningEvent<Name extends LearningEventName>(
  name: Name,
  payload: LearningEventPayloads[Name],
): void {
  if (!isGame(payload.game)) return

  switch (name) {
    case 'LearningPlanStarted': {
      const value = payload as LearningEventPayloads['LearningPlanStarted']
      emit(name, {
        game: value.game,
        surface: 'today_plan',
        plan_size: count(value.planSize),
        completed_before: count(value.completedBefore),
        exam_ref: examScope(value.examRef),
      })
      return
    }
    case 'LearningPlanCompleted': {
      const value = payload as LearningEventPayloads['LearningPlanCompleted']
      emit(name, {
        game: value.game,
        surface: 'today_plan',
        answered_count: count(value.answeredCount),
        correct_count: count(value.correctCount),
        accuracy_percent: percent(value.accuracyPercent),
        verified: true,
      })
      return
    }
    case 'DueReviewCompleted': {
      const value = payload as LearningEventPayloads['DueReviewCompleted']
      if (!RESULTS.has(value.result) || !OVERDUE_BUCKETS.has(value.overdueBucket)) return
      emit(name, {
        game: value.game,
        result: value.result,
        overdue_bucket: value.overdueBucket,
        verified: true,
      })
      return
    }
    case 'DelayedCorrectnessObserved': {
      const value = payload as LearningEventPayloads['DelayedCorrectnessObserved']
      if ((value.result !== 'correct' && value.result !== 'incorrect')
        || !DELAY_BUCKETS.has(value.delayBucket)) return
      emit(name, {
        game: value.game,
        result: value.result,
        delay_bucket: value.delayBucket,
        verified: true,
      })
      return
    }
    case 'OutcomeStatusVerified': {
      const value = payload as LearningEventPayloads['OutcomeStatusVerified']
      if (!OUTCOME_STATUSES.has(value.status)) return
      emit(name, {
        game: value.game,
        status: value.status,
        evidence_bucket: evidenceBucket(value.evidenceCount),
        verified: true,
      })
      return
    }
    case 'CoachStageViewed': {
      const value = payload as LearningEventPayloads['CoachStageViewed']
      if (!COACH_STAGES.has(value.stage) || (value.result !== 'shown' && value.result !== 'error')) return
      emit(name, {
        game: value.game,
        stage: value.stage,
        result: value.result,
      })
      return
    }
    case 'CoachTransferResult': {
      const value = payload as LearningEventPayloads['CoachTransferResult']
      if (!RESULTS.has(value.result)
        || !TRANSFER_TIMINGS.has(value.timing)
        || !Number.isInteger(value.coachDepth)
        || value.coachDepth < 0
        || value.coachDepth > 4) return
      emit(name, {
        game: value.game,
        result: value.result,
        coach_depth: value.coachDepth,
        timing: value.timing,
        verified: true,
      })
    }
  }
}

import type { GameSlug } from '@/lib/constants/games'
import type { BilgeTahtaStage } from './contract'
import { trackEvent } from '@/lib/utils/plausible'

export type BilgeBoardEventName =
  | 'BilgeBoardOpened'
  | 'BilgeBoardStageViewed'
  | 'BilgeBoardReturnedToQuestion'
  | 'BilgeBoardCompleted'

interface SharedPayload {
  surface: 'study' | 'game'
  game?: GameSlug
}

export interface BilgeBoardEventPayloads {
  BilgeBoardOpened: SharedPayload & {
    entryPoint: 'study_assistant' | 'coach_stage'
    examRef?: string | null
  }
  BilgeBoardStageViewed: SharedPayload & {
    stage: BilgeTahtaStage
    stepIndex: number
  }
  BilgeBoardReturnedToQuestion: SharedPayload & {
    elapsedMs: number
  }
  BilgeBoardCompleted: SharedPayload & {
    stepCount: number
  }
}

type AnalyticsProps = Record<string, string | number | boolean>

const GAMES = new Set<GameSlug>(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal'])
const EXAM_REFS = new Set(['TYT', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT', 'LGS'])
const STAGES = new Set<BilgeTahtaStage>([
  'concept', 'worked-example', 'practice', 'hint1', 'hint2', 'small-example',
  'solution', 'transfer', 'transfer-result',
])

function shared(payload: SharedPayload): AnalyticsProps | null {
  if (payload.surface !== 'study' && payload.surface !== 'game') return null
  if (payload.game !== undefined && !GAMES.has(payload.game)) return null
  return {
    surface: payload.surface,
    game: payload.game ?? 'none',
  }
}

function examScope(value: string | null | undefined): string {
  if (!value) return 'none'
  const normalized = value.trim().toUpperCase()
  return EXAM_REFS.has(normalized) ? normalized : 'other'
}

function durationBucket(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'unknown'
  if (elapsedMs < 15_000) return 'under_15s'
  if (elapsedMs < 60_000) return '15_59s'
  if (elapsedMs < 180_000) return '1_2m'
  return '3m_plus'
}

function count(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.trunc(value)))
}

export function trackBilgeBoardEvent<Name extends BilgeBoardEventName>(
  name: Name,
  payload: BilgeBoardEventPayloads[Name],
): void {
  const base = shared(payload)
  if (!base) return

  switch (name) {
    case 'BilgeBoardOpened': {
      const value = payload as BilgeBoardEventPayloads['BilgeBoardOpened']
      if (value.entryPoint !== 'study_assistant' && value.entryPoint !== 'coach_stage') return
      trackEvent(name, { props: { ...base, entry_point: value.entryPoint, exam_ref: examScope(value.examRef) } })
      return
    }
    case 'BilgeBoardStageViewed': {
      const value = payload as BilgeBoardEventPayloads['BilgeBoardStageViewed']
      if (!STAGES.has(value.stage)) return
      trackEvent(name, { props: { ...base, stage: value.stage, step_index: count(value.stepIndex, 11) } })
      return
    }
    case 'BilgeBoardReturnedToQuestion': {
      const value = payload as BilgeBoardEventPayloads['BilgeBoardReturnedToQuestion']
      trackEvent(name, { props: { ...base, duration_bucket: durationBucket(value.elapsedMs) } })
      return
    }
    case 'BilgeBoardCompleted': {
      const value = payload as BilgeBoardEventPayloads['BilgeBoardCompleted']
      trackEvent(name, { props: { ...base, step_count: count(value.stepCount, 12) } })
    }
  }
}

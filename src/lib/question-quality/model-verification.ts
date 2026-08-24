import { createHash } from 'node:crypto'
import { seededPermutation, toBlindView, toCanonicalIndex } from '@/lib/question-audit/blind-view'
import { buildBlindSolverPrompt, PROMPT_VERSION } from '@/lib/question-audit/prompts'
import type { LlmProvider } from '@/lib/question-audit/provider'
import { blindSolverShape } from '@/lib/question-audit/response-shapes'
import { runAgent } from '@/lib/question-audit/run-agent'
import { blindSolverSchema } from '@/lib/question-audit/schemas'
import type { QuestionDraft } from '@/lib/question-audit/types'
import type { AuxiliaryEvidence, EvidenceDirection } from './consensus'

export const COMMUNITY_BLIND_PROMPT_VERSION = `${PROMPT_VERSION.blindSolver}+community@1`

export interface BlindModelVerification extends AuxiliaryEvidence {
  status: 'ok' | 'failed'
  providerId: string
  modelId: string
  promptVersion: string
  predictedAnswerIndex: number | null
  reasoning: string | null
  inputSha256: string
  error: string | null
}

function seed(contentSha256: string, providerId: string): number {
  return Number.parseInt(createHash('sha256').update(`${contentSha256}:${providerId}`).digest('hex').slice(0, 8), 16)
}

/** One blind solution from one provider. The key and user claim never enter the prompt. */
export async function runBlindModelVerification(
  draft: QuestionDraft,
  provider: LlmProvider,
): Promise<BlindModelVerification> {
  const permutation = seededPermutation(draft.options.length, seed(draft.contentSha256, provider.id))
  const view = toBlindView(draft, permutation)
  const prompt = buildBlindSolverPrompt(view)
  const inputSha256 = createHash('sha256').update(`${prompt.system}\n${prompt.user}`).digest('hex')
  const outcome = await runAgent({
    provider,
    promptVersion: COMMUNITY_BLIND_PROMPT_VERSION,
    request: {
      system: prompt.system,
      user: prompt.user,
      temperature: 0.4,
      maxOutputTokens: 2048,
      schema: blindSolverShape(draft.options.length),
    },
    schema: blindSolverSchema(draft.options.length),
    timeoutMs: 60_000,
    maxAttempts: 3,
  })
  if (outcome.status !== 'ok') {
    return {
      status: 'failed', direction: 'inconclusive', strength: 0,
      providerId: outcome.status === 'failed' ? outcome.telemetry.providerId : provider.id,
      modelId: provider.modelId, promptVersion: COMMUNITY_BLIND_PROMPT_VERSION,
      predictedAnswerIndex: null, reasoning: null, inputSha256,
      error: outcome.status === 'failed' ? outcome.error.message : outcome.reason,
    }
  }
  const predictedAnswerIndex = toCanonicalIndex(view, outcome.data.predictedAnswerIndex)
  const direction: EvidenceDirection = predictedAnswerIndex === null || predictedAnswerIndex !== draft.markedAnswerIndex
    ? 'supports_flaw'
    : 'supports_clean'
  return {
    status: 'ok', direction, strength: predictedAnswerIndex === null ? 0.90 : 0.75,
    providerId: outcome.telemetry.providerId, modelId: outcome.telemetry.modelId,
    promptVersion: COMMUNITY_BLIND_PROMPT_VERSION,
    predictedAnswerIndex, reasoning: outcome.data.reasoning, inputSha256, error: null,
  }
}


import { createHash } from 'node:crypto'
import type { LlmProvider } from '@/lib/question-audit/provider'
import { toDraft } from '@/lib/question-audit/question-source'
import type { QuestionDraft } from '@/lib/question-audit/types'
import { estimateWorkerReliability, evaluateCommunityConsensus, type CommunityClaimEvidence } from './consensus'
import { runGroundedOfficialResearch } from './grounded-research'
import { runBlindModelVerification } from './model-verification'

export interface VerificationJob {
  verificationId: string
  role: 'model_a' | 'model_b' | 'research'
  caseId: string
  questionId: string
  revisionId: string
  contentSha256: string
  content: Record<string, unknown>
  game: string
  category: string
  topic: string | null
  examRef: string | null
}

export interface WorkerVerificationResult {
  status: 'ok' | 'failed' | 'skipped'
  providerId: string
  modelId: string
  promptVersion: string
  direction: 'supports_clean' | 'supports_flaw' | 'inconclusive'
  strength: number
  predictedAnswerIndex: number | null
  findingCodes: string[]
  evidence: Record<string, unknown>
  sources: Array<{ url: string; title: string; authoritative: boolean }>
  inputSha256: string | null
  error: string | null
}

function jobDraft(job: VerificationJob): QuestionDraft {
  const result = toDraft({
    id: job.questionId, game: job.game, category: job.category,
    topic: job.topic, exam_ref: job.examRef, content: job.content,
    published_revision_id: job.revisionId, content_sha256: job.contentSha256,
  }, { strictExamOptionCount: true })
  if (!result.ok) throw new Error(`quality job deterministik kapida kaldi: ${result.reason}`)
  return result.draft
}

export async function processVerificationJob(input: {
  job: VerificationJob
  modelA: LlmProvider
  modelB: LlmProvider
  researchApiKey: string
  researchModelId: string
}): Promise<WorkerVerificationResult> {
  const draft = jobDraft(input.job)
  if (input.job.role === 'research') {
    const result = await runGroundedOfficialResearch({
      draft, apiKey: input.researchApiKey, modelId: input.researchModelId,
    })
    return {
      status: result.status, providerId: result.providerId, modelId: result.modelId,
      promptVersion: result.promptVersion, direction: result.direction, strength: result.strength,
      predictedAnswerIndex: null, findingCodes: [],
      evidence: { rationale: result.rationale }, sources: result.sources,
      inputSha256: result.inputSha256, error: result.error,
    }
  }
  const result = await runBlindModelVerification(draft, input.job.role === 'model_a' ? input.modelA : input.modelB)
  return {
    status: result.status, providerId: result.providerId, modelId: result.modelId,
    promptVersion: result.promptVersion, direction: result.direction, strength: result.strength,
    predictedAnswerIndex: result.predictedAnswerIndex, findingCodes: [],
    evidence: { reasoning: result.reasoning }, sources: [], inputSha256: result.inputSha256,
    error: result.error,
  }
}

interface CaseEvidencePayload {
  case: { caseId: string }
  claims: Array<{
    userId: string; independenceKey: string; verdict: 'clean' | 'flawed'; reasonCode: string | null;
    correctionFingerprint: string | null; profile: {
      resolvedTotal: number; flawedControls: number; flawedControlsCorrect: number;
      cleanControls: number; cleanControlsCorrect: number; correctionChecks: number;
      correctionChecksCorrect: number;
    }
  }>
  verifications: Array<{
    role: 'model_a' | 'model_b' | 'research'; status: string;
    direction: 'supports_clean' | 'supports_flaw' | 'inconclusive' | null; strength: number | null;
    sources: Array<{ authoritative?: boolean }>;
  }>
}

export function evaluateCaseEvidence(payload: CaseEvidencePayload) {
  const claims: CommunityClaimEvidence[] = payload.claims.map((claim) => ({
    userId: claim.userId, independenceKey: claim.independenceKey, verdict: claim.verdict,
    reasonCode: claim.reasonCode, correctionFingerprint: claim.correctionFingerprint,
    reliability: estimateWorkerReliability(claim.profile),
  }))
  const modelEvidence = payload.verifications
    .filter((verification) => verification.status === 'ok')
    .map((verification) => ({
      direction: verification.direction ?? 'inconclusive', strength: verification.strength ?? 0,
    }))
  const result = evaluateCommunityConsensus({
    claims, modelEvidence,
    externalProof: 'none',
    externalProofDirection: 'inconclusive',
  })
  const inputsSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return { ...result, externalProof: 'none' as const, inputsSha256 }
}

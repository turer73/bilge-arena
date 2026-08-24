import { COMMUNITY_QUALITY_POLICY as DEFAULT_POLICY } from './community-policy'

export type QualityVerdict = 'clean' | 'flawed'
export type EvidenceDirection = 'supports_clean' | 'supports_flaw' | 'inconclusive'
export type ExternalProof = 'none' | 'deterministic' | 'official_source' | 'curator'
export type ConsensusDecision = 'collecting' | 'suspected' | 'quarantine' | 'confirmed' | 'rejected' | 'inconclusive'

export interface WorkerReliability {
  sensitivity: number
  specificity: number
  correctionAccuracy: number
  trusted: boolean
}

export interface CommunityClaimEvidence {
  userId: string
  independenceKey: string
  verdict: QualityVerdict
  reasonCode: string | null
  correctionFingerprint: string | null
  reliability: WorkerReliability
}

export interface AuxiliaryEvidence {
  direction: EvidenceDirection
  strength: number
}

export interface ConsensusInput {
  claims: CommunityClaimEvidence[]
  modelEvidence?: AuxiliaryEvidence[]
  optionStatisticEvidence?: AuxiliaryEvidence | null
  externalProof?: ExternalProof
  externalProofDirection?: EvidenceDirection
}

export interface ConsensusResult {
  decision: ConsensusDecision
  posteriorDefectProbability: number
  independentUserCount: number
  independentClusterCount: number
  trustedAgreementCount: number
  leadingReasonCode: string | null
  leadingCorrectionFingerprint: string | null
  needsMore: number
  rationale: string
}

type Policy = typeof DEFAULT_POLICY

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const logit = (probability: number) => Math.log(probability / (1 - probability))
const logistic = (odds: number) => 1 / (1 + Math.exp(-odds))

function claimKey(claim: CommunityClaimEvidence): string {
  if (claim.verdict === 'clean') return 'clean'
  return `flawed:${claim.reasonCode ?? 'other'}:${claim.correctionFingerprint ?? 'unspecified'}`
}

function deduplicateClaims(claims: readonly CommunityClaimEvidence[]): CommunityClaimEvidence[] {
  const byUser = new Map<string, CommunityClaimEvidence>()
  for (const claim of claims) if (!byUser.has(claim.userId)) byUser.set(claim.userId, claim)
  return [...byUser.values()]
}

function humanLogLikelihood(claim: CommunityClaimEvidence, policy: Policy): number {
  const sensitivity = clamp(claim.reliability.sensitivity, 0.51, 0.98)
  const specificity = clamp(claim.reliability.specificity, 0.51, 0.98)
  const raw = claim.verdict === 'flawed'
    ? Math.log(sensitivity / (1 - specificity))
    : Math.log((1 - sensitivity) / specificity)
  const correctionFactor = claim.verdict === 'flawed'
    ? clamp(claim.reliability.correctionAccuracy, 0.5, 1)
    : 1
  return clamp(raw * correctionFactor, -policy.maxHumanContributionLogOdds, policy.maxHumanContributionLogOdds)
}

function auxiliaryLogLikelihood(evidence: AuxiliaryEvidence | undefined | null): number {
  if (!evidence || evidence.direction === 'inconclusive') return 0
  const magnitude = clamp(evidence.strength, 0, 1)
  return evidence.direction === 'supports_flaw' ? magnitude * 2.2 : magnitude * -2.2
}

/**
 * A sequential, weighted evidence policy. It deliberately does not use raw
 * majority vote. Models and option statistics are capped auxiliary evidence;
 * they can never satisfy the minimum human agreement contract.
 */
export function evaluateCommunityConsensus(
  input: ConsensusInput,
  policy: Policy = DEFAULT_POLICY,
): ConsensusResult {
  const claims = deduplicateClaims(input.claims)
  const independentClusters = new Set(claims.map((claim) => claim.independenceKey))
  const grouped = new Map<string, CommunityClaimEvidence[]>()
  for (const claim of claims) {
    const key = claimKey(claim)
    grouped.set(key, [...(grouped.get(key) ?? []), claim])
  }
  const leading = [...grouped.entries()].sort((a, b) => {
    const trustedDiff = b[1].filter((claim) => claim.reliability.trusted).length
      - a[1].filter((claim) => claim.reliability.trusted).length
    return trustedDiff || b[1].length - a[1].length || a[0].localeCompare(b[0])
  })[0] ?? ['clean', []]
  const [leadingKey, leadingClaims] = leading
  const leadingIndependenceKeys = new Set(leadingClaims.map((claim) => claim.independenceKey))
  const trustedAgreementCount = leadingClaims.filter((claim) => claim.reliability.trusted).length

  let logOdds = logit(policy.priorDefectProbability)
  for (const claim of claims) logOdds += humanLogLikelihood(claim, policy)

  const modelContribution = clamp(
    (input.modelEvidence ?? []).reduce((total, evidence) => total + auxiliaryLogLikelihood(evidence), 0),
    -policy.maxCombinedModelContributionLogOdds,
    policy.maxCombinedModelContributionLogOdds,
  )
  logOdds += modelContribution
  logOdds += clamp(
    auxiliaryLogLikelihood(input.optionStatisticEvidence),
    -policy.maxOptionStatisticContributionLogOdds,
    policy.maxOptionStatisticContributionLogOdds,
  )

  if (input.externalProof && input.externalProof !== 'none'
    && input.externalProofDirection && input.externalProofDirection !== 'inconclusive') {
    logOdds += input.externalProofDirection === 'supports_flaw' ? 4.6 : -4.6
  }
  const posterior = logistic(logOdds)
  const humanFloorMet = claims.length >= policy.minIndependentUsers
    && independentClusters.size >= policy.minIndependentUsers
    && leadingIndependenceKeys.size >= policy.minTrustedAgreement
    && trustedAgreementCount >= policy.minTrustedAgreement
  const leadingFlaw = leadingKey.startsWith('flawed:')
  const exactCorrection = leadingFlaw && !leadingKey.endsWith(':unspecified')
  const proofSupportsFlaw = input.externalProof !== 'none'
    && input.externalProof !== undefined
    && input.externalProofDirection === 'supports_flaw'

  let decision: ConsensusDecision = 'collecting'
  if (humanFloorMet && leadingFlaw && exactCorrection && posterior >= policy.confirmPosterior && proofSupportsFlaw) {
    decision = 'confirmed'
  } else if (humanFloorMet && leadingFlaw && exactCorrection && posterior >= policy.quarantinePosterior) {
    decision = 'quarantine'
  } else if (humanFloorMet && leadingFlaw) {
    decision = 'suspected'
  } else if (humanFloorMet && !leadingFlaw && posterior <= policy.rejectPosterior) {
    decision = 'rejected'
  } else if (claims.length >= policy.maxIndependentUsers) {
    decision = 'inconclusive'
  }

  const parts = leadingKey.split(':')
  return {
    decision,
    posteriorDefectProbability: posterior,
    independentUserCount: claims.length,
    independentClusterCount: independentClusters.size,
    trustedAgreementCount,
    leadingReasonCode: leadingFlaw ? (parts[1] ?? null) : null,
    leadingCorrectionFingerprint: leadingFlaw ? (parts.slice(2).join(':') || null) : null,
    needsMore: Math.max(0, policy.minIndependentUsers - Math.min(claims.length, independentClusters.size)),
    rationale: `policy=${policy.minIndependentUsers}/${policy.minTrustedAgreement}; users=${claims.length}; clusters=${independentClusters.size}; trusted=${trustedAgreementCount}; posterior=${posterior.toFixed(6)}; leading=${leadingKey}`,
  }
}

export interface ReliabilityCounters {
  resolvedTotal: number
  flawedControls: number
  flawedControlsCorrect: number
  cleanControls: number
  cleanControlsCorrect: number
  correctionChecks: number
  correctionChecksCorrect: number
}

function betaMean(successes: number, total: number): number {
  return (successes + 2) / (total + 4)
}

/** Conservative worker profile: new workers remain useful, but cannot be trusted. */
export function estimateWorkerReliability(counters: ReliabilityCounters): WorkerReliability {
  const sensitivity = betaMean(counters.flawedControlsCorrect, counters.flawedControls)
  const specificity = betaMean(counters.cleanControlsCorrect, counters.cleanControls)
  const correctionAccuracy = betaMean(counters.correctionChecksCorrect, counters.correctionChecks)
  const trusted = counters.resolvedTotal >= 20
    && counters.flawedControls >= 5
    && counters.cleanControls >= 5
    && sensitivity >= 0.70
    && specificity >= 0.80
  return { sensitivity, specificity, correctionAccuracy, trusted }
}

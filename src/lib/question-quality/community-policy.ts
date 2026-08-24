export const COMMUNITY_QUALITY_POLICY_VERSION = 'community-quality@1'

export const COMMUNITY_QUALITY_POLICY = {
  minIndependentUsers: 5,
  minTrustedAgreement: 3,
  maxIndependentUsers: 11,
  quarantinePosterior: 0.98,
  confirmPosterior: 0.995,
  rejectPosterior: 0.02,
  priorDefectProbability: 0.02,
  maxHumanContributionLogOdds: 3,
  maxCombinedModelContributionLogOdds: 2.2,
  maxOptionStatisticContributionLogOdds: 0.75,
  discoveryCoins: 75,
  acceptedCorrectionCoins: 125,
  corroborationCoins: 10,
} as const

export const COMMUNITY_CONTROL_POLICY = {
  initialRate: 0.20,
  initialCleanRate: 0.10,
  initialFlawedRate: 0.10,
  trustedRate: 0.075,
  restrictedRate: 0.35,
} as const


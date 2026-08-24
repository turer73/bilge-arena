/** The server switch is intentionally the only rollout gate for every API. */
export function contentGovernanceEnabled(): boolean {
  return process.env.CONTENT_GOVERNANCE_ENABLED === 'true'
}

/** Community review is a separate rollout because it needs migration 146 and worker secrets. */
export function communityQuestionQualityEnabled(): boolean {
  return contentGovernanceEnabled()
    && process.env.NEXT_PUBLIC_COMMUNITY_QUESTION_QUALITY_ENABLED === 'true'
}

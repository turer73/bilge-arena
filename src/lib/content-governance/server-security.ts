/** The server switch is intentionally the only rollout gate for every API. */
export function contentGovernanceEnabled(): boolean {
  return process.env.CONTENT_GOVERNANCE_ENABLED === 'true'
}

import { afterEach, describe, expect, it } from 'vitest'
import { communityQuestionQualityEnabled } from '../server-security'

const originalGovernance = process.env.CONTENT_GOVERNANCE_ENABLED
const originalCommunity = process.env.NEXT_PUBLIC_COMMUNITY_QUESTION_QUALITY_ENABLED

afterEach(() => {
  if (originalGovernance === undefined) delete process.env.CONTENT_GOVERNANCE_ENABLED
  else process.env.CONTENT_GOVERNANCE_ENABLED = originalGovernance
  if (originalCommunity === undefined) delete process.env.NEXT_PUBLIC_COMMUNITY_QUESTION_QUALITY_ENABLED
  else process.env.NEXT_PUBLIC_COMMUNITY_QUESTION_QUALITY_ENABLED = originalCommunity
})

describe('communityQuestionQualityEnabled', () => {
  it('requires both the governance and community rollout gates', () => {
    process.env.CONTENT_GOVERNANCE_ENABLED = 'true'
    delete process.env.NEXT_PUBLIC_COMMUNITY_QUESTION_QUALITY_ENABLED
    expect(communityQuestionQualityEnabled()).toBe(false)

    process.env.NEXT_PUBLIC_COMMUNITY_QUESTION_QUALITY_ENABLED = 'true'
    expect(communityQuestionQualityEnabled()).toBe(true)

    process.env.CONTENT_GOVERNANCE_ENABLED = 'false'
    expect(communityQuestionQualityEnabled()).toBe(false)
  })
})

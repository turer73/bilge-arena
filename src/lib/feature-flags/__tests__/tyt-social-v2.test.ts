import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { isTytSocialV2ClientEnabled, parseTytSocialV2ClientFlag } from '../tyt-social-v2-client'
import { isTytSocialV2LearnerEnabled, parseTytSocialV2ServerFlags } from '../tyt-social-v2-server'

describe('TYT Social V2 learner rollout flags', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('server and client flags default to disabled', () => {
    expect(parseTytSocialV2ServerFlags({})).toBe(false)
    expect(parseTytSocialV2ClientFlag(undefined)).toBe(false)
  })

  test('each flag requires the exact true value', () => {
    expect(parseTytSocialV2ServerFlags({
      TYT_SOCIAL_V2_LEARNER_ENABLED: 'true',
      NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'true',
    })).toBe(true)
    expect(parseTytSocialV2ServerFlags({
      TYT_SOCIAL_V2_LEARNER_ENABLED: 'true',
      NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'false',
    })).toBe(false)
    expect(parseTytSocialV2ServerFlags({
      TYT_SOCIAL_V2_LEARNER_ENABLED: 'false',
      NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'true',
    })).toBe(false)
    expect(parseTytSocialV2ClientFlag('true')).toBe(true)
    expect(parseTytSocialV2ServerFlags({ TYT_SOCIAL_V2_LEARNER_ENABLED: 'TRUE', NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'true' })).toBe(false)
    expect(parseTytSocialV2ClientFlag('1')).toBe(false)
  })

  test('runtime server helper requires both flags', () => {
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    expect(isTytSocialV2LearnerEnabled()).toBe(true)
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'false')
    expect(isTytSocialV2LearnerEnabled()).toBe(false)
    expect(isTytSocialV2ClientEnabled()).toBe(false)
  })
})

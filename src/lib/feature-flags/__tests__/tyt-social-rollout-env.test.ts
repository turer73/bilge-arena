import { describe, expect, it } from 'vitest'
import { assertTytSocialRolloutEnv } from '../../../../scripts/security/validate-tyt-social-rollout-env.mjs'

describe('TYT Social rollout environment preflight', () => {
  it.each([
    [{}, false],
    [{
      NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'false',
      TYT_SOCIAL_V2_LEARNER_ENABLED: 'false',
    }, false],
    [{
      NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'true',
      TYT_SOCIAL_V2_LEARNER_ENABLED: 'true',
    }, true],
  ] as const)('accepts an aligned rollout state', (env, expected) => {
    expect(assertTytSocialRolloutEnv(env)).toBe(expected)
  })

  it.each([
    {
      NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'true',
      TYT_SOCIAL_V2_LEARNER_ENABLED: 'false',
    },
    {
      NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED: 'false',
      TYT_SOCIAL_V2_LEARNER_ENABLED: 'true',
    },
  ] as const)('rejects a split client/server rollout', (env) => {
    expect(() => assertTytSocialRolloutEnv(env)).toThrow('flags must match')
  })

  it.each([
    ['NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'TRUE'],
    ['TYT_SOCIAL_V2_LEARNER_ENABLED', '1'],
    ['TYT_SOCIAL_V2_LEARNER_ENABLED', 'yes'],
  ] as const)('rejects non-literal value for %s', (name, value) => {
    expect(() => assertTytSocialRolloutEnv({ [name]: value })).toThrow('literal true or false')
  })
})

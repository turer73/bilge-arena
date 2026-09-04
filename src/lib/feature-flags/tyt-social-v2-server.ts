import 'server-only'

export interface TytSocialV2ServerFlagEnv {
  TYT_SOCIAL_V2_LEARNER_ENABLED?: string
  NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED?: string
}

/** Server-only learner rollout gate for the governed TYT Social flow. */
export function isTytSocialV2LearnerEnabled(): boolean {
  return process.env.TYT_SOCIAL_V2_LEARNER_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED === 'true'
}

export function parseTytSocialV2ServerFlags(env: TytSocialV2ServerFlagEnv): boolean {
  return env.TYT_SOCIAL_V2_LEARNER_ENABLED === 'true'
    && env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED === 'true'
}

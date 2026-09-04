const FLAG_NAMES = [
  'NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED',
  'TYT_SOCIAL_V2_LEARNER_ENABLED',
]

/**
 * Build/dev preflight for the two-part TYT Social learner rollout switch.
 * Undefined is the documented safe default. Defined values must be literal
 * booleans and both effective values must match, otherwise the client and
 * server could be built for different products.
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function assertTytSocialRolloutEnv(env = process.env) {
  for (const name of FLAG_NAMES) {
    const value = env[name]
    if (value !== undefined && value !== 'true' && value !== 'false') {
      throw new Error(`${name} must be the literal true or false`)
    }
  }

  const clientEnabled = env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED === 'true'
  const serverEnabled = env.TYT_SOCIAL_V2_LEARNER_ENABLED === 'true'
  if (clientEnabled !== serverEnabled) {
    throw new Error('TYT Social V2 client and server rollout flags must match')
  }

  return clientEnabled
}

'use client'

/** Client-side companion gate; never reads the server-only rollout variable. */
export function isTytSocialV2ClientEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED === 'true'
}

export function parseTytSocialV2ClientFlag(value: unknown): boolean {
  return value === 'true'
}

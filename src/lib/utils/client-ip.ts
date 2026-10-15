import { isIP } from 'node:net'

/**
 * Vercel overwrites X-Forwarded-For at its edge to prevent client spoofing.
 * Do not trust cf-connecting-ip unless Cloudflare is the enforced origin path:
 * on a direct Vercel deployment a client can supply that header itself.
 *
 * The rightmost XFF entry is the nearest hop. Missing or malformed values
 * share the "unknown" rate-limit bucket instead of creating attacker-chosen
 * buckets. Revisit this trust contract before hosting outside Vercel.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  const nearest = forwarded?.split(',').at(-1)?.trim()
  return nearest && isIP(nearest) ? nearest : 'unknown'
}

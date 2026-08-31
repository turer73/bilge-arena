import { z } from 'zod'

export const TYT_SOCIAL_POLICY_NOTICE_VERSION = 'tyt-social-choice-notice-v1'
export const TYT_SOCIAL_SUPPORTED_POLICY_VERSION = 'tyt-social-2026-v1'

export const tytSocialPolicyVariantSchema = z.enum([
  'questions_16_20',
  'questions_21_25',
])

export const setTytSocialPolicyRequestSchema = z.object({
  variant: tytSocialPolicyVariantSchema,
  requestId: z.uuid(),
}).strict()

// UI category semantics are versioned with the database policy. A newer
// policy must ship an explicit client contract instead of silently reusing v1.
const policyVersionSchema = z.literal(TYT_SOCIAL_SUPPORTED_POLICY_VERSION)
const rulesSha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const effectiveAtSchema = z.string().datetime({ offset: true })

const unavailablePolicySchema = z.object({
  status: z.literal('unavailable'),
  appliesTo: z.literal('new_artifacts_only'),
}).strict()

const setupRequiredPolicySchema = z.object({
  status: z.literal('setup_required'),
  policyVersion: policyVersionSchema,
  rulesSha256: rulesSha256Schema,
  appliesTo: z.literal('new_artifacts_only'),
}).strict()

const activePolicySchema = z.object({
  status: z.literal('active'),
  policyVersion: policyVersionSchema,
  variant: tytSocialPolicyVariantSchema,
  effectiveAt: effectiveAtSchema,
  appliesTo: z.literal('new_artifacts_only'),
}).strict()

export const getTytSocialPolicyResponseSchema = z.discriminatedUnion('status', [
  unavailablePolicySchema,
  setupRequiredPolicySchema,
  activePolicySchema,
])

export const setTytSocialPolicyResponseSchema = activePolicySchema.extend({
  replayed: z.boolean(),
}).strict()

export type TytSocialPolicyVariant = z.infer<typeof tytSocialPolicyVariantSchema>
export type GetTytSocialPolicyResponse = z.infer<typeof getTytSocialPolicyResponseSchema>
export type SetTytSocialPolicyResponse = z.infer<typeof setTytSocialPolicyResponseSchema>

const TYT_SOCIAL_ALLOWED_CATEGORIES: Record<TytSocialPolicyVariant, readonly string[]> = {
  questions_16_20: ['tarih', 'cografya', 'felsefe', 'sosyoloji', 'din_kulturu'],
  questions_21_25: ['tarih', 'cografya', 'felsefe', 'sosyoloji'],
}

/**
 * Public category availability derived from the neutral answer-range choice.
 * The reason for a learner's choice is never collected or inferred.
 */
export function getTytSocialAllowedCategories(
  policyVersion: string,
  variant: TytSocialPolicyVariant,
): readonly string[] {
  if (policyVersion !== TYT_SOCIAL_SUPPORTED_POLICY_VERSION) return []
  return TYT_SOCIAL_ALLOWED_CATEGORIES[variant]
}

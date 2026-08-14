import { z } from 'zod'

const timestampSchema = z.string().datetime({ offset: true })

export const institutionSupportAccessSchema = z.object({
  institutionId: z.string().uuid(),
  active: z.boolean(),
  grantRef: z.string().regex(/^[0-9a-f]{32}$/).nullable(),
  scope: z.literal('read_only'),
  reason: z.string().min(10).max(500).nullable(),
  grantedAt: timestampSchema.nullable(),
  expiresAt: timestampSchema.nullable(),
  replayed: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.active && (!value.grantRef || !value.reason || !value.grantedAt || !value.expiresAt)) {
    context.addIssue({ code: 'custom', message: 'active support access is incomplete' })
  }
  if (!value.active && (value.grantRef || value.reason || value.grantedAt || value.expiresAt)) {
    context.addIssue({ code: 'custom', message: 'inactive support access contains grant data' })
  }
})

export const institutionSupportGrantInputSchema = z.object({
  durationMinutes: z.number().int().min(15).max(1440),
  reason: z.string().trim().min(10).max(500),
  requestId: z.string().uuid(),
}).strict()

export const institutionSupportRevokeInputSchema = z.object({
  requestId: z.string().uuid(),
}).strict()

export type InstitutionSupportAccess = z.infer<typeof institutionSupportAccessSchema>

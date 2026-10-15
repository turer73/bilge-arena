import { z } from 'zod'

export const SOCIAL_DISCOVERY_LABEL = 'Sosyal başlangıç keşfi'
export const SOCIAL_DISCOVERY_DESCRIPTION = 'Tarih, coğrafya, felsefe ve sosyolojiden 12 soru. Sonuç, ilk çalışma yönünü bulmana yardımcı olur; tam TYT değerlendirmesi veya hâkimiyet puanı değildir.'
const category = z.enum(['tarih', 'cografya', 'felsefe', 'sosyoloji'])
const observation = z.object({ category, answered: z.literal(3), correct: z.number().int().min(0).max(3) }).strict()
export const socialPilotPublicSchema = z.object({
  supported: z.boolean(),
  label: z.literal(SOCIAL_DISCOVERY_LABEL),
  description: z.literal(SOCIAL_DISCOVERY_DESCRIPTION),
  questionCount: z.literal(12),
  session: z.object({
    id: z.string().uuid(),
    status: z.enum(['active', 'completed', 'abandoned', 'expired']),
    expiresAt: z.string().datetime({ offset: true }),
    answeredCount: z.number().int().min(0).max(12),
    question: z.object({
      id: z.string().uuid(), category, question: z.string().min(1),
      passage: z.string().nullable(), options: z.array(z.string().min(1)).length(5),
    }).strict().nullable(),
    observations: z.array(observation).length(4).nullable(),
  }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const session = value.session
  if ((!value.supported && session) || (session && (
    (session.status === 'active') !== (session.question !== null)
    || (session.status === 'completed') !== (session.observations !== null)
    || (session.status === 'completed' ? session.answeredCount !== 12 : session.answeredCount >= 12)
    || (session.observations && new Set(session.observations.map(item => item.category)).size !== 4)
  ))) ctx.addIssue({ code: 'custom', message: 'Invalid pilot progress' })
})
export type SocialPilotPublic = z.infer<typeof socialPilotPublicSchema>
export function parseSocialPilotPublic(value: unknown): SocialPilotPublic | null {
  const result = socialPilotPublicSchema.safeParse(value)
  return result.success ? result.data : null
}

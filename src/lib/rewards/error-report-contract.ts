import { z } from 'zod'

/**
 * award_error_report_reward (migration 128) sonucu.
 *
 * `awarded=false` iki durumda doner ve ikisi de hata degildir:
 * - `replayed=true`: rapor daha once odullendirilmis (idempotency)
 * - `replayed=false`: raporlayan anonim/silinmis ya da admin kendi raporu
 */
export const errorReportRewardResultSchema = z.object({
  reportId: z.string().uuid(),
  awarded: z.boolean(),
  replayed: z.boolean(),
  coins: z.number().int().min(0),
}).strict()

export type ErrorReportRewardResult = z.infer<typeof errorReportRewardResultSchema>

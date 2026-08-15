import { z } from 'zod'

/**
 * Sinav modu sozlesmesi.
 *
 * Politika EKRAN bazli degil KIMLIK bazlidir: ogrencinin aktif uyeligi
 * bulunan herhangi bir sinifta sinav modu aciksa yardimcilar platformun
 * her yerinde kapanir. Ekran bazli olsaydi ogrenci ikinci sekmede serbest
 * oyuna gecip yardimcilari kullanabilirdi.
 */
export const assistancePolicySchema = z.object({
  examMode: z.boolean(),
  board: z.boolean(),
  coach: z.boolean(),
  assistant: z.boolean(),
  until: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  // Sinav modu aciksa uc yardimcinin ucu de kapali olmak zorundadir.
  if (value.examMode && (value.board || value.coach || value.assistant)) {
    context.addIssue({ code: 'custom', message: 'exam mode must close every helper' })
  }
})

export type AssistancePolicy = z.infer<typeof assistancePolicySchema>

/**
 * Fail-closed varsayilan: politika okunamazsa yardimcilar KAPALI sayilir.
 * Sinav butunlugu ag hatasina feda edilmez.
 */
export const CLOSED_ASSISTANCE_POLICY: AssistancePolicy = {
  examMode: true,
  board: false,
  coach: false,
  assistant: false,
  until: null,
}

/**
 * Sinifi olmayan ogrenci icin varsayilan: hicbir sinav penceresi yoksa
 * yardimcilar aciktir.
 */
export const OPEN_ASSISTANCE_POLICY: AssistancePolicy = {
  examMode: false,
  board: true,
  coach: true,
  assistant: true,
  until: null,
}

export const examModeToggleInputSchema = z.object({
  enabled: z.boolean(),
  requestId: z.string().uuid(),
}).strict()

export type ExamModeToggleInput = z.infer<typeof examModeToggleInputSchema>

export const examModeToggleResultSchema = z.object({
  classroomId: z.string().uuid(),
  examMode: z.boolean(),
  until: z.string().datetime({ offset: true }).nullable(),
  replayed: z.boolean(),
}).strict()

/** Ogretmen panelinin okudugu sinif bazli sinav modu durumu. */
export const classroomExamModeSchema = z.object({
  classroomId: z.string().uuid(),
  examMode: z.boolean(),
  until: z.string().datetime({ offset: true }).nullable(),
}).strict()

/**
 * Ajan yanitlarinin dogrulama semalari.
 *
 * NEDEN PROVIDER SEMASI YETMEZ:
 *
 * Gemini `responseSchema` ile `Type.INTEGER` dayatabilirsin — ama bu bir TIP
 * kisitidir, ARALIK kisiti degil. `description: "sadece 0-4"` bir kisit degil
 * serbest metindir; model 7 donebilir. Repo bu bugu zaten yasamis ve ona karsi
 * eski prototipte elle kontrol gerektiriyordu (`self_answer_out_of_range`).
 *
 * DeepSeek/OpenAI-uyumlu provider'larda durum daha da zayif: `response_format:
 * json_object` yalniz "gecerli JSON" garanti eder, sema uyumu DEGIL. Yani
 * DeepSeek kullanildiginda bu dosya TEK garantidir.
 *
 * Bu yuzden semalar sik sayisina bagli fabrika fonksiyonlaridir — 4/5 sik
 * ayrimi runtime'da dogrulanir, hicbir yerde 5 varsayilmaz.
 */

import { z } from 'zod'
import { FLAW_SEVERITY, type FlawCode } from './types'

const FLAW_CODES = Object.keys(FLAW_SEVERITY) as [FlawCode, ...FlawCode[]]

/** Adversarial'in uretmesine izin verilen kodlar. Digerleri baska ajanin isi. */
const ADVERSARIAL_CODES = ['MULTIPLE_CORRECT', 'MISSING_PREMISE', 'AMBIGUOUS_WORDING', 'STEM_MISSING_TOKEN'] as const

const findingSchema = (optionCount: number) =>
  z.object({
    code: z.enum(FLAW_CODES),
    evidence: z.string().min(1).max(2000),
    optionIndexes: z.array(z.number().int().min(0).max(optionCount - 1)).max(optionCount).optional(),
  })

/**
 * Kor Cozucu.
 *
 * `predictedAnswerIndex` EKRAN indeksidir (permute edilmis olabilir) —
 * kanonige cevirmek `toCanonicalIndex`'in isi. null = model bir sonuca vardi
 * ama hicbir sikla eslestiremedi.
 */
export const blindSolverSchema = (optionCount: number) =>
  z.object({
    reasoning: z.string().min(1),
    predictedAnswerIndex: z.number().int().min(0).max(optionCount - 1).nullable(),
    computedValue: z.string().max(200).nullable().default(null),
  })

export const adversarialSchema = (optionCount: number) =>
  z.object({
    reasoning: z.string().min(1),
    findings: z
      .array(findingSchema(optionCount))
      .max(8)
      .default([])
      // Ajan sinirlarini koru: adversarial kendi katalogu disina cikamaz.
      // Cikarsa bu bir prompt regresyonudur ve sessizce yutulmamali.
      .refine(
        (fs) => fs.every((f) => (ADVERSARIAL_CODES as readonly string[]).includes(f.code)),
        { message: 'adversarial ajan kendi katalogu disinda kod uretti' },
      )
      // MULTIPLE_CORRECT kanitsiz kabul edilmez: hangi siklar oldugu sart.
      .refine(
        (fs) => fs.every((f) => f.code !== 'MULTIPLE_CORRECT' || (f.optionIndexes?.length ?? 0) >= 2),
        { message: 'MULTIPLE_CORRECT en az iki optionIndexes ister' },
      ),
  })

/**
 * Cozum Denetcisi.
 *
 * Model KARSILASTIRMA yapmaz — yalniz cozumun hangi sikka vardigini cikarir.
 * `solutionConcludesIndex` KANONIK indekstir (bu ajan permute edilmemis
 * gorunum alir, cunku isaretli cevabi zaten gorur).
 */
export const solutionVerifierSchema = (optionCount: number) =>
  z.object({
    reasoning: z.string().min(1),
    solutionConcludesIndex: z.number().int().min(0).max(optionCount - 1).nullable(),
    solutionCompleteness: z.enum(['adequate', 'terse']),
  })

export type BlindSolverParsed = z.infer<ReturnType<typeof blindSolverSchema>>
export type AdversarialParsed = z.infer<ReturnType<typeof adversarialSchema>>
export type SolutionVerifierParsed = z.infer<ReturnType<typeof solutionVerifierSchema>>

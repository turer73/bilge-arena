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
 * gorunum alir). Isaretli cevap modele gonderilmez.
 * Eski sozlesme yalniz @1/@2/@3 arsivlerinin yeniden okunmasinda kullanilir.
 */
export const legacySolutionVerifierSchema = (optionCount: number) =>
  z.object({
    reasoning: z.string().min(1),
    solutionConcludesIndex: z.number().int().min(0).max(optionCount - 1).nullable(),
    solutionCompleteness: z.enum(['adequate', 'terse']),
  })

/**
 * Yalniz acik cevap tekrarlarini ayirt eder; matematiksel esdegerlik cozumlemez.
 * Isaret, kesir, ondalik ve birim aynen kalir. Soru turunu tahmin etmez.
 */
function isBareOption(quote: string, options: readonly string[]): boolean {
  const fold = (text: string) => text.trim().toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ').replace(/[.!;]+$/, '').trim()
  const value = fold(quote).replace(/^(?:(?:doğru|dogru) )?(?:yanıt|yanit|cevap|sonuç|sonuc)\s*:?\s+/u, '')
  return options.some((option) => value === fold(option))
}

/**
 * @4: kanit kaynagi soru/gerekce DEGIL, yazarın solutionText'idir.
 * Uydurma alinti bir ajan/sozlesme hatasidir; soru kusuru diye kaydedilmez.
 * Semantik yeterlilik hala model yargisidir; bu kontrol terfi benchmark'i degildir.
 */
export const solutionVerifierSchema = (options: readonly string[], solutionText: string) =>
  legacySolutionVerifierSchema(options.length).extend({
    evidenceVersion: z.literal('solution-evidence@1'),
    questionDemand: z.enum(['recall', 'reasoning']),
    supportingQuotes: z.array(z.string().min(1).max(2000)).max(8),
  }).strict().superRefine((value, ctx) => {
    value.supportingQuotes.forEach((quote, index) => {
      if (!quote.trim() || !solutionText.includes(quote)) {
        ctx.addIssue({ code: 'custom', path: ['supportingQuotes', index], message: 'alinti solutionText icinde birebir bulunmuyor' })
      }
    })
    if (value.solutionCompleteness !== 'adequate') return
    if (value.supportingQuotes.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['supportingQuotes'], message: 'adequate karari yazarin metninden dayanak gerektirir' })
    }
    if (value.questionDemand === 'reasoning' && (
      isBareOption(solutionText, options) ||
      (value.supportingQuotes.length > 0 && value.supportingQuotes.every((quote) => isBareOption(quote, options)))
    )) {
      ctx.addIssue({ code: 'custom', path: ['supportingQuotes'], message: 'yalniz cevap tekrari hesap/cikarim dayanagi olamaz' })
    }
  })

export type BlindSolverParsed = z.infer<ReturnType<typeof blindSolverSchema>>
export type AdversarialParsed = z.infer<ReturnType<typeof adversarialSchema>>
export type SolutionVerifierParsed = z.infer<ReturnType<typeof solutionVerifierSchema>>

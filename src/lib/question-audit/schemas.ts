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
import { authorEvidenceUnits } from './solution-evidence'

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
export const quotedSolutionVerifierSchema = (options: readonly string[], solutionText: string) =>
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

/** @5 wire contract: arbitrary model quotations are not accepted. */
export const referencedSolutionVerifierSchema = (options: readonly string[], solutionText: string) => {
  const units = new Map(authorEvidenceUnits(solutionText).map((unit) => [unit.id, unit.text]))
  return legacySolutionVerifierSchema(options.length).extend({
    evidenceVersion: z.literal('solution-evidence@2'),
    questionDemand: z.enum(['recall', 'reasoning']),
    supportingUnitIds: z.array(z.string().regex(/^author:\d+$/)).max(8),
  }).strict().transform((value, ctx) => {
    const seen = new Set<string>()
    const supportingQuotes: string[] = []
    value.supportingUnitIds.forEach((id, index) => {
      const quote = units.get(id)
      if (quote === undefined || seen.has(id)) {
        ctx.addIssue({ code: 'custom', path: ['supportingUnitIds', index], message: 'bilinmeyen veya tekrarlanan yazar parcasi' })
      } else {
        supportingQuotes.push(quote)
        seen.add(id)
      }
    })
    if (value.solutionCompleteness === 'adequate') {
      if (supportingQuotes.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['supportingUnitIds'], message: 'adequate karari yazarin metninden dayanak gerektirir' })
      }
      if (value.questionDemand === 'reasoning' && (isBareOption(solutionText, options) ||
        (supportingQuotes.length > 0 && supportingQuotes.every((quote) => isBareOption(quote, options))))) {
        ctx.addIssue({ code: 'custom', path: ['supportingUnitIds'], message: 'yalniz cevap tekrari hesap/cikarim dayanagi olamaz' })
      }
    }
    return { ...value, supportingQuotes }
  })
}

/** Stored @5 output includes code-derived quotes: verify, never silently replace. */
export const storedReferencedSolutionVerifierSchema = (options: readonly string[], solutionText: string) =>
  z.object({ supportingQuotes: z.array(z.string().min(1).max(2000)).max(8) }).passthrough()
    .transform(({ supportingQuotes, ...wire }, ctx) => {
      const result = referencedSolutionVerifierSchema(options, solutionText).safeParse(wire)
      if (!result.success) {
        for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
        return z.NEVER
      }
      if (JSON.stringify(supportingQuotes) !== JSON.stringify(result.data.supportingQuotes)) {
        ctx.addIssue({ code: 'custom', path: ['supportingQuotes'], message: 'saklanan alintilar yazar parcalariyla eslesmiyor' })
        return z.NEVER
      }
      return result.data
    })

/** @6: semantic claim/support conflicts are review signals, not broken JSON. */
export const solutionVerifierSchema = (options: readonly string[], solutionText: string) => {
  const units = new Map(authorEvidenceUnits(solutionText).map((unit) => [unit.id, unit.text]))
  return legacySolutionVerifierSchema(options.length).extend({
    evidenceVersion: z.literal('solution-evidence@3'),
    questionDemand: z.enum(['recall', 'reasoning']),
    supportingUnitIds: z.array(z.string().regex(/^author:\d+$/)).max(8),
  }).strict().transform((value, ctx) => {
    const seen = new Set<string>()
    const supportingQuotes: string[] = []
    for (const [index, id] of value.supportingUnitIds.entries()) {
      const quote = units.get(id)
      if (quote === undefined || seen.has(id)) {
        ctx.addIssue({ code: 'custom', path: ['supportingUnitIds', index], message: 'bilinmeyen veya tekrarlanan yazar parcasi' })
      } else {
        seen.add(id)
        supportingQuotes.push(quote)
      }
    }
    // Do NOT rewrite solutionCompleteness or claim semantic sufficiency.
    const supportAssessment = value.questionDemand === 'reasoning' && isBareOption(solutionText, options)
      ? 'answer_only_for_reported_reasoning' as const
      : value.solutionCompleteness === 'adequate' && supportingQuotes.length === 0
        ? 'missing_cited_support' as const
        : value.solutionCompleteness === 'adequate' && value.questionDemand === 'reasoning' &&
          supportingQuotes.every((quote) => isBareOption(quote, options))
          ? 'answer_only_citation' as const
          : 'not_established' as const
    return { ...value, supportingQuotes, supportAssessment }
  })
}

export const storedSolutionVerifierSchema = (options: readonly string[], solutionText: string) =>
  z.object({
    supportingQuotes: z.array(z.string().min(1).max(2000)).max(8),
    supportAssessment: z.enum(['answer_only_for_reported_reasoning', 'missing_cited_support', 'answer_only_citation', 'not_established']),
  }).passthrough().transform(({ supportingQuotes, supportAssessment, ...wire }, ctx) => {
    const result = solutionVerifierSchema(options, solutionText).safeParse(wire)
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
      return z.NEVER
    }
    if (JSON.stringify(supportingQuotes) !== JSON.stringify(result.data.supportingQuotes) ||
      supportAssessment !== result.data.supportAssessment) {
      ctx.addIssue({ code: 'custom', message: 'saklanan dayanak degerlendirmesi veya alintilar girdiyle eslesmiyor' })
      return z.NEVER
    }
    return result.data
  })

export type BlindSolverParsed = z.infer<ReturnType<typeof blindSolverSchema>>
export type AdversarialParsed = z.infer<ReturnType<typeof adversarialSchema>>
export type SolutionVerifierParsed = z.infer<ReturnType<typeof solutionVerifierSchema>>

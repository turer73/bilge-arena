/**
 * Kor ajanlarin gorebilecegi daraltilmis soru gorunumu.
 *
 * NEDEN BRANDED TYPE, NEDEN `Omit` DEGIL:
 *
 *   function f(v: Omit<QuestionDraft, 'markedAnswerIndex' | 'solutionText'>) {}
 *   const draft: QuestionDraft = ...
 *   f(draft)   // ✅ DERLENIR
 *
 * TypeScript yapisal tiplidir; excess-property kontrolu yalniz taze nesne
 * literallerinde calisir. `Omit` ile daralttigin bir parametreye tam nesneyi
 * gecirebilirsin ve alanlar runtime'da hala oradadir — `JSON.stringify(v)`
 * onlari prompt'a yazar. Yani `Omit` bir sizdirmazlik garantisi DEGILDIR.
 *
 * Gercek garanti uc parcali:
 *   1. Brand — bu tipi baska yerde fabrike edemezsin
 *   2. `toBlindView` tek yapici — alanlari YENI nesneye kopyalar, cast etmez
 *   3. Prompt yapicilarin imzasi yalniz bu tipi kabul eder
 *
 * Ve asil kilit `__tests__/blind-view.test.ts` icindeki sizinti testidir.
 */

import type { QuestionDraft } from './types'

declare const blindViewBrand: unique symbol

/**
 * Kor ajanin gordugu her sey. `markedAnswerIndex` ve `solutionText` YOK —
 * tip duzeyinde degil, nesne duzeyinde yok.
 */
export interface BlindQuestionView {
  readonly [blindViewBrand]: true
  readonly questionId: string
  readonly examRef: string
  readonly subject: string
  readonly topic: string | null
  readonly questionText: string
  readonly passage: string | null
  /** Permute edilmis olabilir; `permutation` ile kanonige donulur. */
  readonly options: readonly string[]
  /** permutation[ekranIdx] = kanonikIdx. Kimlik permutasyonu = permute edilmedi. */
  readonly permutation: readonly number[]
}

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

/**
 * TEK yapici. Alanlari yeni nesneye kopyalar — kaynak nesneye referans tutmaz,
 * bu yuzden `markedAnswerIndex`/`solutionText` sonuca hicbir yoldan sizamaz.
 *
 * @param permutation Verilirse siklar bu siraya gore gosterilir.
 *   `permutation[ekranIdx] = kanonikIdx`. k-of-n orneklemede her tur farkli
 *   permutasyonla cagrilir; boylece LLM'in bilinen pozisyon yanliligi olculur
 *   ve tahminin gercekten icerikten geldigi test edilir.
 */
export function toBlindView(
  draft: QuestionDraft,
  permutation?: readonly number[],
): BlindQuestionView {
  const perm = permutation ? [...permutation] : identity(draft.options.length)

  if (perm.length !== draft.options.length) {
    throw new Error(
      `permutation uzunlugu sik sayisiyla uyusmuyor: ${perm.length} != ${draft.options.length}`,
    )
  }
  const seen = new Set(perm)
  if (seen.size !== perm.length || perm.some((i) => !Number.isInteger(i) || i < 0 || i >= perm.length)) {
    throw new Error(`gecersiz permutasyon: ${JSON.stringify(perm)}`)
  }

  const view = {
    questionId: draft.questionId,
    examRef: draft.examRef,
    subject: draft.subject,
    topic: draft.topic,
    questionText: draft.questionText,
    passage: draft.passage,
    options: perm.map((canonical) => draft.options[canonical]),
    permutation: perm,
  }
  // Cift cast, TUM dosyadaki tek cast: brand bir `unique symbol` oldugu icin
  // runtime'da set edilemez, dolayisiyla yapisal olarak uretilemez. Kacisin
  // tek noktada olmasi markanin anlamidir — baska hicbir yerde bu tip
  // fabrike edilemez.
  return view as unknown as BlindQuestionView
}

/** Ekran indeksini kanonik DB indeksine cevirir. Aralik disi ise null. */
export function toCanonicalIndex(view: BlindQuestionView, screenIndex: number | null): number | null {
  if (screenIndex === null) return null
  if (!Number.isInteger(screenIndex) || screenIndex < 0 || screenIndex >= view.permutation.length) {
    return null
  }
  return view.permutation[screenIndex]
}

/**
 * Deterministik permutasyon uretici (seed'li Fisher-Yates).
 *
 * Math.random DEGIL: kalibrasyon kosusunun yeniden uretilebilir olmasi sart —
 * bir uyusmazligi tekrar incelerken ayni sik sirasini kurabilmelisin.
 */
export function seededPermutation(n: number, seed: number): number[] {
  const out = identity(n)
  let s = seed >>> 0
  for (let i = n - 1; i > 0; i--) {
    // xorshift32 — kriptografik degil, yalniz tekrarlanabilirlik icin
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

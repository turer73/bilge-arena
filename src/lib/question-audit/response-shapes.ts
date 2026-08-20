/**
 * Provider-tarafi yanit semalari (Gemini `responseSchema` lehcesi).
 *
 * NEDEN ELLE YAZILDI, ZOD'DAN URETILMEDI:
 *   Gemini'nin kabul ettigi sema alt-kumesi JSON Schema'nin tamami degil
 *   (`minimum`/`maximum`/`refine` yok, `propertyOrdering` ise JSON Schema'da
 *   olmayan Gemini'ye ozgu bir alan). Zod->JSONSchema cevirisi bu farklari
 *   sessizce yutar veya provider 400 dondurur. Uc ajan icin elle yazmak hem
 *   kisa hem surprizsiz.
 *
 * NEDEN `propertyOrdering` KRITIK:
 *   Sema property sirasi, uretim sirasini KENDILIGINDEN garanti etmez. Sira
 *   sabitlenmezse model karari once uretip gerekceyi sonra yazabilir — yani
 *   Chain-of-Thought'un tersi: karar once, rasyonalizasyon sonra. Ve bu SESSIZ
 *   olur: cikti gecerli JSON, testler yesil, dogruluk dusuk. Bu yuzden
 *   "reasoning" her semada ILK siradadir.
 *
 * `zod` semalari (schemas.ts) bunun yerine gecmez, USTUNE biner: burasi tipi
 * dayatir, orasi ARALIGI dogrular. Gemini `INTEGER` diyebilir ama "0..n-1"
 * diyemez; DeepSeek'te ise bu katman hic yok, Zod tek garanti kalir.
 */

export interface GeminiSchema {
  type: 'OBJECT' | 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'ARRAY'
  description?: string
  nullable?: boolean
  enum?: string[]
  items?: GeminiSchema
  properties?: Record<string, GeminiSchema>
  required?: string[]
  propertyOrdering?: string[]
}

export function blindSolverShape(optionCount: number): GeminiSchema {
  const maxIdx = optionCount - 1
  return {
    type: 'OBJECT',
    properties: {
      reasoning: { type: 'STRING', description: 'Sorunun adim adim cozumu.' },
      predictedAnswerIndex: {
        type: 'INTEGER',
        nullable: true,
        description: `Cozumun denk geldigi secenek indeksi (0-${maxIdx}). Hicbir secenekle eslesmiyorsa null.`,
      },
      computedValue: {
        type: 'STRING',
        nullable: true,
        description: 'Bulunan ham sonuc (or. "61", "2 mol"). Yoksa null.',
      },
    },
    required: ['reasoning', 'predictedAnswerIndex'],
    propertyOrdering: ['reasoning', 'predictedAnswerIndex', 'computedValue'],
  }
}

export function adversarialShape(): GeminiSchema {
  return {
    type: 'OBJECT',
    properties: {
      reasoning: { type: 'STRING', description: 'Denenen aciklar ve neden gectikleri/kaldiklari.' },
      findings: {
        type: 'ARRAY',
        description: 'Kusur bulunamadiysa bos dizi.',
        items: {
          type: 'OBJECT',
          properties: {
            code: { type: 'STRING', enum: ['MULTIPLE_CORRECT', 'MISSING_PREMISE', 'AMBIGUOUS_WORDING'] },
            evidence: { type: 'STRING', description: 'Somut, gosterilebilir kanit.' },
            optionIndexes: {
              type: 'ARRAY',
              items: { type: 'INTEGER' },
              description: 'MULTIPLE_CORRECT icin zorunlu: hangi secenekler.',
            },
          },
          required: ['code', 'evidence'],
          propertyOrdering: ['code', 'evidence', 'optionIndexes'],
        },
      },
    },
    required: ['reasoning', 'findings'],
    propertyOrdering: ['reasoning', 'findings'],
  }
}

export function solutionVerifierShape(optionCount: number): GeminiSchema {
  const maxIdx = optionCount - 1
  return {
    type: 'OBJECT',
    properties: {
      reasoning: { type: 'STRING', description: 'Cozum metnini takip ederek nereye vardigi.' },
      solutionConcludesIndex: {
        type: 'INTEGER',
        nullable: true,
        description: `Cozumun vardigi secenek indeksi (0-${maxIdx}). Hicbirine varmiyorsa null.`,
      },
      solutionCompleteness: { type: 'STRING', enum: ['adequate', 'terse'] },
    },
    required: ['reasoning', 'solutionConcludesIndex', 'solutionCompleteness'],
    propertyOrdering: ['reasoning', 'solutionConcludesIndex', 'solutionCompleteness'],
  }
}

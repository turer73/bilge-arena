import { describe, expect, it } from 'vitest'
import { seededPermutation, toBlindView, toCanonicalIndex } from '../blind-view'
import { buildAdversarialPrompt, buildBlindSolverPrompt, buildSolutionVerifierPrompt } from '../prompts'
import type { QuestionDraft } from '../types'

function draft(overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    questionId: 'q1',
    revisionId: 'r1',
    contentSha256: 'a'.repeat(64),
    examRef: 'TYT',
    subject: 'Matematik',
    topic: 'Turev',
    questionText: 'f(x)=x^2 icin f\'(3) kactir?',
    passage: null,
    options: ['3', '5', '6', '9', '12'],
    markedAnswerIndex: 2,
    solutionText: 'f\'(x)=2x oldugundan f\'(3)=6 bulunur. Cevap C.',
    ...overrides,
  }
}

describe('toBlindView — sizdirmazlik', () => {
  it('gorunumde markedAnswerIndex ve solutionText alanlari YOK', () => {
    const v = toBlindView(draft())
    expect(Object.keys(v)).not.toContain('markedAnswerIndex')
    expect(Object.keys(v)).not.toContain('solutionText')
    // Serilestirme yolu da temiz olmali: JSON.stringify(view) prompt'a girse bile sizmaz.
    expect(JSON.stringify(v)).not.toContain('solutionText')
  })

  it('kaynak draft degistiginde gorunum ETKILENMEZ (referans degil kopya)', () => {
    const d = draft()
    const v = toBlindView(d)
    d.options[0] = 'DEGISTI'
    expect(v.options[0]).toBe('3')
  })
})

/**
 * ASIL GARANTI BU.
 *
 * Substring kontrolu tek basina yetersiz VE yaniltici olur: dogru sikkin METNI
 * prompt'ta bulunmak ZORUNDA (seceneklerden biri o). Naif bir "dogru cevap
 * metni prompt'ta olmasin" testi burada yanlis alarm verir.
 *
 * Dogru test: cevap anahtarini/cozumu DEGISTIR, prompt'un BAYT BAYT AYNI
 * kaldigini dogrula. Prompt bu alanlara bagli olamiyorsa sizinti da olamaz.
 */
describe('kor prompt — cevap anahtarindan bagimsizlik', () => {
  it('markedAnswerIndex degisince kor cozucu prompt\'u degismez', () => {
    const prompts = [0, 1, 2, 3, 4].map((i) =>
      JSON.stringify(buildBlindSolverPrompt(toBlindView(draft({ markedAnswerIndex: i })))),
    )
    expect(new Set(prompts).size).toBe(1)
  })

  it('markedAnswerIndex degisince adversarial prompt\'u degismez', () => {
    const prompts = [0, 1, 2, 3, 4].map((i) =>
      JSON.stringify(buildAdversarialPrompt(toBlindView(draft({ markedAnswerIndex: i })))),
    )
    expect(new Set(prompts).size).toBe(1)
  })

  it('solutionText degisince kor prompt\'lar degismez', () => {
    const variants = [null, '', 'Cevap E olmalidir cunku 12.', 'x'.repeat(500)]
    const blind = variants.map((s) => JSON.stringify(buildBlindSolverPrompt(toBlindView(draft({ solutionText: s })))))
    const adv = variants.map((s) => JSON.stringify(buildAdversarialPrompt(toBlindView(draft({ solutionText: s })))))
    expect(new Set(blind).size).toBe(1)
    expect(new Set(adv).size).toBe(1)
  })

  it('ayirt edici cozum metni kor prompt\'lara sizmaz', () => {
    const marker = 'ZZ_COZUM_IMZASI_9137_ZZ'
    const v = toBlindView(draft({ solutionText: `f'(3)=6. ${marker}` }))
    for (const p of [buildBlindSolverPrompt(v), buildAdversarialPrompt(v)]) {
      expect(`${p.system}\n${p.user}`).not.toContain(marker)
    }
  })
})

describe('cozum denetcisi prompt\'u', () => {
  it('cozum metnini icerir ama isaretli cevabi ACIKLAMAZ', () => {
    const marker = 'ZZ_COZUM_IMZASI_9137_ZZ'
    const d = draft({ solutionText: `f'(3)=6. ${marker}` })
    const p = buildSolutionVerifierPrompt(d)
    const full = `${p.system}\n${p.user}`
    expect(full).toContain(marker)
    // Model karsilastirma yapmamali: isaretli cevap prompt'a girmez.
    expect(new Set([0, 1, 2, 3, 4].map((i) =>
      JSON.stringify(buildSolutionVerifierPrompt(draft({ ...d, markedAnswerIndex: i }))),
    )).size).toBe(1)
  })

  it('cozum bossa prompt uretmez — ajan atlanmali', () => {
    expect(() => buildSolutionVerifierPrompt(draft({ solutionText: '' }))).toThrow()
    expect(() => buildSolutionVerifierPrompt(draft({ solutionText: null }))).toThrow()
    expect(() => buildSolutionVerifierPrompt(draft({ solutionText: '   ' }))).toThrow()
  })
})

describe('sik sayisi — 5 sabiti yok', () => {
  it('4 sikli LGS sorusunda "4 (E): undefined" satiri OLUSMAZ', () => {
    const d = draft({ examRef: 'LGS', options: ['2', '4', '6', '8'], markedAnswerIndex: 1 })
    const p = buildBlindSolverPrompt(toBlindView(d))
    const full = `${p.system}\n${p.user}`
    expect(full).not.toContain('undefined')
    expect(full).toContain('Secenekler (4 adet)')
    expect(full).toContain('3 (D): 8')
    expect(full).not.toContain('4 (E)')
    expect(full).toContain('0-3')
  })
})

describe('permutasyon', () => {
  it('ekran indeksi kanonige dogru cevrilir', () => {
    const d = draft()
    const perm = [4, 2, 0, 3, 1]
    const v = toBlindView(d, perm)
    expect(v.options).toEqual(['12', '6', '3', '9', '5'])
    // Ekranda 1. sirada gosterilen "6", kanonikte idx2.
    expect(toCanonicalIndex(v, 1)).toBe(2)
    expect(toCanonicalIndex(v, null)).toBeNull()
    expect(toCanonicalIndex(v, 9)).toBeNull()
  })

  it('seededPermutation tekrarlanabilir ve gecerli', () => {
    expect(seededPermutation(5, 42)).toEqual(seededPermutation(5, 42))
    const p = seededPermutation(5, 7)
    expect([...p].sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('gecersiz permutasyon reddedilir', () => {
    expect(() => toBlindView(draft(), [0, 1, 2])).toThrow()
    expect(() => toBlindView(draft(), [0, 0, 1, 2, 3])).toThrow()
  })
})

/**
 * Bilge Arena: exam-types helper (YKS/LGS sınav türü -> içerik eşlemesi)
 */

import { describe, test, expect } from 'vitest'
import {
  gamesForExamType,
  defaultExamRefForType,
  examRefsForType,
  questionExamRefForGame,
  EXAM_TYPE_LABELS,
} from '../exam-types'

describe('gamesForExamType', () => {
  test('LGS -> İngilizce (YDT-only) HARİÇ; matematik/türkçe/fen/sosyal DAHİL', () => {
    const slugs = gamesForExamType('lgs').map((g) => g.slug)
    expect(slugs).toEqual(expect.arrayContaining(['matematik', 'turkce', 'fen', 'sosyal']))
    expect(slugs).not.toContain('wordquest') // İngilizce examTags=['YDT'], LGS'de yok
    expect(slugs).toHaveLength(4)
  })

  test('YKS -> tüm oyunlar (5, hepsinde TYT/AYT/YDT var)', () => {
    expect(gamesForExamType('yks')).toHaveLength(5)
  })

  test('null/belirlenmemiş -> tüm oyunlar (YKS-default geriye uyum)', () => {
    expect(gamesForExamType(null)).toHaveLength(5)
    expect(gamesForExamType(undefined)).toHaveLength(5)
  })
})

describe('defaultExamRefForType', () => {
  test('YKS -> TYT, LGS -> LGS (MVP eşleme)', () => {
    expect(defaultExamRefForType('yks')).toBe('TYT')
    expect(defaultExamRefForType('lgs')).toBe('LGS')
  })

  test('null/geçersiz -> null (filtresiz)', () => {
    expect(defaultExamRefForType(null)).toBeNull()
    expect(defaultExamRefForType(undefined)).toBeNull()
  })
})

describe('questionExamRefForGame', () => {
  test('Wordquest soru isteklerinde paylasilan sinav tercihini filtreye tasimaz', () => {
    expect(questionExamRefForGame('wordquest', 'TYT')).toBeNull()
    expect(questionExamRefForGame('wordquest', 'YDT')).toBeNull()
  })

  test('diger derslerde secili sinav kapsamini korur', () => {
    expect(questionExamRefForGame('matematik', 'AYT-SAY')).toBe('AYT-SAY')
    expect(questionExamRefForGame('turkce', null)).toBeNull()
  })

  test('Sosyal filtresiz birakilamaz; null kapsam TYT olarak fail-closed tamamlanir', () => {
    expect(questionExamRefForGame('sosyal', null, true)).toBe('TYT')
    expect(questionExamRefForGame('sosyal', 'LGS')).toBe('LGS')
  })

  test('learner rollout kapalıyken Social null kapsamı legacy filtresiz akışı korur', () => {
    expect(questionExamRefForGame('sosyal', null, false)).toBeNull()
  })
})

test('etiketler tanımlı', () => {
  expect(EXAM_TYPE_LABELS.yks).toMatch(/YKS/)
  expect(EXAM_TYPE_LABELS.lgs).toMatch(/LGS/)
})

test('AYT esit agirlik kapsaminda matematik bulunur', () => {
  expect(examRefsForType('yks')).toContain('AYT-EA')
  expect(gamesForExamType('yks').find((game) => game.slug === 'matematik')?.examTags).toContain('AYT-EA')
})

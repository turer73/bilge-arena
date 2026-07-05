/**
 * Soru bankası kalite regresyon-kilidi.
 *
 * validate-question-bank.mjs'in ERROR sınıfını (kesin-deterministik defektler:
 * answer-index, seçenek-sayısı, birebir-dup-şık, encoding/mojibake, boş-alan)
 * sıfırda tutar. Yeni soru eklenince/düzenlenince bu sınıf regresyon yapamaz.
 *
 * WARN sınıfı (solution↔answer triyajı, redundancy) CI'ı BLOKLAMAZ — heuristik
 * FP üretebilir (extractor son-sayı grabs; türetilmiş-cevap/farklı-birim), her
 * aday LLM/insan onayı ister. Yine de sayısı log'lanır.
 *
 * Çalıştırma: npx vitest --config vitest.database.config.ts
 */

import { describe, it, expect } from 'vitest'
import {
  validateQuestionBank,
  extractSolutionValue,
  isNumericOption,
} from '../validate-question-bank.mjs'

describe('validateQuestionBank — ERROR regresyon kilidi', () => {
  const { errors, warnings, stats } = validateQuestionBank()

  it('kesin-defekt ERROR sınıfı SIFIR olmalı', () => {
    if (errors.length) {
      // Fail mesajına ilk 10 hatayı göm (CI log'unda görünür)
      const detail = errors.slice(0, 10).map((e) => `[${e.check}] ${e.loc}: ${e.msg}`).join('\n')
      throw new Error(`${errors.length} ERROR:\n${detail}`)
    }
    expect(errors.length).toBe(0)
  })

  it('banka makul boyutta (>1800 kayıt, tüm dosyalar)', () => {
    expect(stats.total).toBeGreaterThan(1800)
    expect(Object.keys(stats.files).length).toBeGreaterThanOrEqual(6)
  })

  it('WARN triyaj sayıları görünür (bilgi — CI bloklamaz)', () => {
    // Bu test bilgi amaçlı; triyaj listesi büyürse görünsün diye log.
    console.log(`[soru-bankası] WARN triyaj: ${warnings.length}`, stats.byCheck)
    expect(Array.isArray(warnings)).toBe(true)
  })
})

describe('extractSolutionValue — son-sayı (FP-fix regresyon kilidi)', () => {
  // Ara-adım FP'si: solution "1 mol → 2 mol CO₂" nihai cevap 2, ilk-sayı 1 DEĞİL.
  it('son sayı-token alınır, ilk değil', () => {
    expect(extractSolutionValue('1 mol CH₄ → 1 mol CO₂. 2 mol CH₄ → 2 mol CO₂.')).toBe('2')
    expect(extractSolutionValue('120=2³×3×5 → farklı asal çarpan: 2, 3, 5 → 3 tane')).toBe('3')
    expect(extractSolutionValue('x>4 → en küçük tam sayı: 5')).toBe('5')
  })
  it('Türkçe format + yüzde + oran korunur', () => {
    expect(extractSolutionValue('Satış 150, kâr: 135-120=15 TL')).toBe('15')
    expect(extractSolutionValue('50/250=%20')).toBe('%20')
    expect(extractSolutionValue('Q=mcΔT=2×4200×50=420.000 J')).toBe('420.000')
    expect(extractSolutionValue('(5k):(−k)=5:-1')).toBe('5:-1')
  })
  it('sondaki cümle-noktalaması temizlenir', () => {
    expect(extractSolutionValue('sonuç = 61.')).toBe('61')
  })
})

describe('isNumericOption', () => {
  it('sayısal/yüzde/oran şıkları tanır', () => {
    expect(isNumericOption('420.000')).toBe(true)
    expect(isNumericOption('%20')).toBe(true)
    expect(isNumericOption('67,5')).toBe(true)
    expect(isNumericOption('5:1')).toBe(true)
  })
  it('metin şıkları sayısal değil', () => {
    expect(isNumericOption('Ankara')).toBe(false)
    expect(isNumericOption('Tt × Tt')).toBe(false)
  })
})

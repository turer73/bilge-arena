/**
 * Soru bankası kalite validatörü — CI regresyon-kilidi.
 *
 * TASARIM (klipper CI-blocker #100475 sonrası): data/soru-bankasi GITIGNORED
 * (ürün-IP, git-filter-repo'yla tarihten temizlendi) -> CI clean-checkout'ta YOK.
 * Bu yüzden CI-lock TRACKED-FIXTURE'a bakar (validator MANTIĞINI doğrular:
 * bilinçli-defektli fixture'da her ERROR/WARN sınıfı yakalanmalı). Gerçek-bank
 * temizliği yalnız LOKAL'de (data-dir varsa) koşullu-kontrol edilir.
 *
 *   npx vitest --config vitest.database.config.ts
 */

import { describe, it, expect } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateQuestionBank,
  questionBankExists,
  extractSolutionValue,
  isNumericOption,
} from '../validate-question-bank.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(__dirname, '..', '__fixtures__', 'question-bank')

describe('validator MANTIĞI — tracked-fixture (CI-deterministik)', () => {
  const { errors, warnings } = validateQuestionBank(FIXTURE)
  const errChecks = new Set(errors.map((e) => e.check))
  const errIds = errors.map((e) => e.loc)

  it('her ERROR sınıfı bilinçli-defekti yakalar', () => {
    for (const cls of ['dup_option_exact', 'answer_oor', 'option_count', 'encoding', 'empty_option']) {
      expect(errChecks, `${cls} yakalanmalı`).toContain(cls)
    }
  })

  it('temiz soru (clean1) hiçbir ERROR üretmez', () => {
    expect(errIds.some((l) => l.includes('clean1'))).toBe(false)
  })

  it('solution-answer tutarsızlık WARN olarak yakalanır (ERROR değil)', () => {
    const warnChecks = new Set(warnings.map((w) => w.check))
    expect(warnChecks).toContain('solution_answer_mismatch')
    expect(errChecks).not.toContain('solution_answer_mismatch')
  })

  it('nested cloze geçerli — cl_ok ERROR üretmez', () => {
    expect(errIds.some((l) => l.includes('cl_ok'))).toBe(false)
  })
})

describe('gerçek soru-bankası (yalnız LOKAL — data-dir varsa)', () => {
  it.skipIf(!questionBankExists())('gerçek bank ERROR=0 (regresyon)', () => {
    const { errors } = validateQuestionBank()
    if (errors.length) {
      throw new Error(`${errors.length} ERROR:\n` + errors.slice(0, 10).map((e) => `[${e.check}] ${e.loc}: ${e.msg}`).join('\n'))
    }
    expect(errors.length).toBe(0)
  })
})

describe('extractSolutionValue — son-sayı (FP-fix regresyon kilidi)', () => {
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

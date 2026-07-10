/**
 * audit-llm-judge unit tests — fetch mock'lu, gerçek API yok.
 *
 * Çalıştırma:
 *   npx vitest --config vitest.database.config.ts
 *
 * Eval (gerçek API ile precision/recall):
 *   node database/__tests__/eval-judge.mjs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Module under test — process.argv'i ezerek import
process.argv = ['node', 'audit-llm-judge.mjs', '--dry-run']
process.env.GEMINI_API_KEY = 'test-key'

const { parseJudgeResponse, buildPromptForQuestion } = await import('../audit-llm-judge.mjs')

describe('parseJudgeResponse', () => {
  it('valid response → ok', () => {
    const raw = JSON.stringify({
      self_answer: 1,
      confidence: 0.9,
      agrees_with_marked: true,
      solution_supports_marked: true,
      issues: [],
      severity: 'ok',
      reasoning_brief: 'Cevap doğru, çözüm tutarlı.'
    })
    const r = parseJudgeResponse(raw)
    expect(r.ok).toBe(true)
    expect(r.self_answer).toBe(1)
    expect(r.severity).toBe('ok')
    expect(r.confidence).toBe(0.9)
  })

  it('major severity + issues array', () => {
    const raw = JSON.stringify({
      self_answer: 2,
      confidence: 0.95,
      agrees_with_marked: false,
      solution_supports_marked: false,
      issues: ['wrong_answer', 'solution_mismatch'],
      severity: 'major',
      reasoning_brief: 'Marked answer 0 ama gerçek 2.'
    })
    const r = parseJudgeResponse(raw)
    expect(r.ok).toBe(true)
    expect(r.agrees_with_marked).toBe(false)
    expect(r.issues).toContain('wrong_answer')
    expect(r.severity).toBe('major')
  })

  it('parse fail → error', () => {
    const r = parseJudgeResponse('not json at all')
    expect(r.error).toBe('parse_failed')
  })

  it('missing required field → error', () => {
    const raw = JSON.stringify({ self_answer: 1, severity: 'ok' })
    const r = parseJudgeResponse(raw)
    expect(r.error).toMatch(/missing_field/)
  })

  it('invalid severity → error', () => {
    const raw = JSON.stringify({
      self_answer: 1,
      agrees_with_marked: true,
      solution_supports_marked: true,
      severity: 'critical'
    })
    const r = parseJudgeResponse(raw)
    expect(r.error).toBe('invalid_severity')
  })

  it('out-of-range self_answer → error', () => {
    const raw = JSON.stringify({
      self_answer: 7,
      agrees_with_marked: false,
      solution_supports_marked: false,
      severity: 'major'
    })
    const r = parseJudgeResponse(raw)
    expect(r.error).toBe('invalid_self_answer')
  })

  it('confidence default 0.5 if missing', () => {
    const raw = JSON.stringify({
      self_answer: 1,
      agrees_with_marked: true,
      solution_supports_marked: true,
      severity: 'ok'
    })
    const r = parseJudgeResponse(raw)
    expect(r.confidence).toBe(0.5)
  })
})

describe('buildPromptForQuestion', () => {
  const sampleQ = {
    game: 'sosyal',
    category: 'tarih',
    difficulty: 2,
    question: 'TBMM hangi tarihte açılmıştır?',
    options: ['19 Mayıs 1919', '23 Nisan 1920', '29 Ekim 1923', '30 Ağustos 1922', '1 Kasım 1922'],
    answer: 1,
    solution: 'TBMM 23 Nisan 1920\'de açıldı.'
  }

  it('system prompt contains 3 check definitions', () => {
    const { system } = buildPromptForQuestion(sampleQ)
    expect(system).toMatch(/SELF-SOLVE/)
    expect(system).toMatch(/ADVERSARIAL/)
    expect(system).toMatch(/SOLUTION COHERENCE/)
  })

  it('system prompt enforces JSON output', () => {
    const { system } = buildPromptForQuestion(sampleQ)
    expect(system).toMatch(/JSON formatında/)
    expect(system).toMatch(/severity/)
  })

  it('user prompt includes question + all 5 options + marked answer', () => {
    const { user } = buildPromptForQuestion(sampleQ)
    expect(user).toContain('TBMM hangi tarihte')
    expect(user).toContain('A) 19 Mayıs 1919')
    expect(user).toContain('B) 23 Nisan 1920')
    expect(user).toContain('E) 1 Kasım 1922')
    expect(user).toContain('İşaretli doğru cevap: B (index 1)')
  })

  it('user prompt includes solution text', () => {
    const { user } = buildPromptForQuestion(sampleQ)
    expect(user).toContain('TBMM 23 Nisan 1920')
  })

  it('empty solution shown as "(boş)"', () => {
    const { user } = buildPromptForQuestion({ ...sampleQ, solution: '' })
    expect(user).toContain('(boş)')
  })

  it('includes category + difficulty + game metadata', () => {
    const { user } = buildPromptForQuestion(sampleQ)
    expect(user).toContain('Kategori: tarih')
    expect(user).toContain('Difficulty: 2')
    expect(user).toContain('Game: sosyal')
  })

  // LGS-4 desteği (fen judge-katmanı): 4 seçenekli soru → A-D, geçerli aralık 0-3
  const lgsQ = {
    game: 'fen',
    category: 'fizik',
    difficulty: 3,
    question: 'Kütlesi 2 kg olan cisme 10 N kuvvet uygulanıyor. İvme kaç m/s²?',
    options: ['2 m/s²', '5 m/s²', '10 m/s²', '20 m/s²'],
    answer: 1,
    solution: 'F=m·a → a=10/2=5 m/s².',
  }

  it('4-seçenekli (LGS) soru: seçenek sayısı + geçerli aralık doğru', () => {
    const { user } = buildPromptForQuestion(lgsQ)
    expect(user).toContain('Seçenekler (4 adet)')
    expect(user).toContain('self_answer 0-3 olmalı')
    expect(user).toContain('D) 20 m/s²')
    expect(user).not.toContain('E) ') // 5. seçenek yok
    expect(user).toContain('İşaretli doğru cevap: B (index 1)')
  })

  it('5-seçenekli soruda geçerli aralık 0-4', () => {
    const { user } = buildPromptForQuestion(sampleQ)
    expect(user).toContain('Seçenekler (5 adet)')
    expect(user).toContain('self_answer 0-4 olmalı')
  })

  it('system prompt görsel-zorunluluk guard içerir (requires_visual)', () => {
    const { system } = buildPromptForQuestion(lgsQ)
    expect(system).toMatch(/GÖRSEL ZORUNLULUĞU/)
    expect(system).toMatch(/requires_visual/)
  })
})

describe('fixture sanity', () => {
  it('known-correct fixtures all have severity=ok expectation', () => {
    const data = JSON.parse(readFileSync(join(__dirname, 'fixtures/known-correct.json'), 'utf-8'))
    expect(data.length).toBeGreaterThanOrEqual(5)
    for (const f of data) {
      expect(f._expected.severity).toBe('ok')
      expect(f._expected.agrees_with_marked).toBe(true)
    }
  })

  it('known-wrong fixtures all expect agrees_with_marked=false', () => {
    const data = JSON.parse(readFileSync(join(__dirname, 'fixtures/known-wrong-answer.json'), 'utf-8'))
    expect(data.length).toBeGreaterThanOrEqual(3)
    for (const f of data) {
      expect(f._expected.agrees_with_marked).toBe(false)
      expect(f._expected.severity).toBe('major')
    }
  })

  it('known-ambiguous fixtures all expect major + multi_correct', () => {
    const data = JSON.parse(readFileSync(join(__dirname, 'fixtures/known-ambiguous.json'), 'utf-8'))
    expect(data.length).toBeGreaterThanOrEqual(2)
    for (const f of data) {
      expect(f._expected.severity).toBe('major')
      expect(f._expected.issues_should_include).toContain('multi_correct')
    }
  })

  it('all fixtures pass basic format guard', () => {
    const allFixtures = [
      ...JSON.parse(readFileSync(join(__dirname, 'fixtures/known-correct.json'), 'utf-8')),
      ...JSON.parse(readFileSync(join(__dirname, 'fixtures/known-wrong-answer.json'), 'utf-8')),
      ...JSON.parse(readFileSync(join(__dirname, 'fixtures/known-ambiguous.json'), 'utf-8')),
    ]
    for (const f of allFixtures) {
      const c = f.content
      expect(c.options).toHaveLength(5)
      expect(c.answer).toBeGreaterThanOrEqual(0)
      expect(c.answer).toBeLessThanOrEqual(4)
      expect(c.question.length).toBeGreaterThan(10)
      expect(c.solution.length).toBeGreaterThan(20)
    }
  })
})

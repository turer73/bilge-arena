import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STAGING_SCHEMA,
  VALIDATOR_VERSION,
  buildPilotManifest,
  buildReviewTemplate,
  evaluatePilotReview,
  parseCoachResponse,
  sha256Hex,
  validateImmutableSourceRow,
  validateManifest,
} from '../lib/coach-curation.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const generator = readFileSync(join(here, '..', 'generate-coach-hints.mjs'), 'utf8')
const discover = readFileSync(join(here, '..', 'discover-coach-eligible.mjs'), 'utf8')
const reviewBuilder = readFileSync(join(here, '..', 'build-coach-review-template.mjs'), 'utf8')
const pilotValidator = readFileSync(join(here, '..', 'validate-coach-pilot.mjs'), 'utf8')

function uuid(prefix, index) {
  return `${prefix}0000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function candidate(index) {
  const games = ['fen', 'matematik', 'sosyal', 'turkce', 'wordquest']
  const exams = ['TYT', 'AYT', 'MSU', null]
  return {
    questionId: uuid('0000', index),
    revisionId: uuid('1000', index),
    contentSha256: index.toString(16).padStart(64, '0'),
    game: games[index % games.length],
    category: `category-${index % 11}`,
    difficulty: (index % 5) + 1,
    examRef: exams[index % exams.length],
    optionCount: (index % 4) + 2,
  }
}

describe('coach curation pilot contract', () => {
  it('selects a deterministic 20-row sample with every game and a bound hash', () => {
    const pool = Array.from({ length: 35 }, (_, index) => candidate(index + 1))
    const first = buildPilotManifest(pool, 20)
    const second = buildPilotManifest([...pool].reverse(), 20)

    expect(first).toEqual(second)
    expect(first.items).toHaveLength(20)
    expect(new Set(first.items.map((item) => item.game))).toEqual(new Set(pool.map((item) => item.game)))
    expect(new Set(first.items.map((item) => item.difficulty)).size).toBe(5)
    expect(new Set(first.items.map((item) => item.optionCount)).size).toBe(4)
    expect(validateManifest(first, { candidates: pool })).toEqual(first)

    expect(() => validateManifest({
      ...first,
      items: first.items.map((item, index) => index === 0 ? { ...item, category: 'tampered' } : item),
    })).toThrow(/SHA-256/)
  })

  it('binds source content to the database digest before building a prompt', () => {
    const contentJson = JSON.stringify({
      question: '2 + 2?',
      options: ['3', '4'],
      answer: 1,
      solution: 'İki sayı toplanır.',
    })
    const item = {
      ...candidate(80),
      optionCount: 2,
      contentSha256: sha256Hex(contentJson),
    }
    const source = validateImmutableSourceRow({
      questionId: item.questionId,
      revisionId: item.revisionId,
      contentSha256: item.contentSha256,
      outcomeTitle: 'Doğal sayılarla toplama yapar.',
      contentJson,
    }, item)
    expect(source.content.answer).toBe(1)
    expect(() => validateImmutableSourceRow({
      questionId: item.questionId,
      revisionId: item.revisionId,
      contentSha256: item.contentSha256,
      outcomeTitle: 'Doğal sayılarla toplama yapar.',
      contentJson: `${contentJson} `,
    }, item)).toThrow(/SHA-256/)
  })

  it('normalizes correct-option null and rejects every broken misconception shape', () => {
    const content = { question: '2 + 2?', options: ['3', '4'], answer: 1, solution: 'Topla.' }
    const valid = JSON.stringify({
      misconceptions: ['Bir eksik sayılmış olabilir.', null],
      hint1: 'İki grubu birleştir.',
      hint2: 'Toplama işlemini kur.',
      miniExample: '1 + 2 örneğinde iki grup birleştirilir ve üç bulunur.',
    })
    expect(parseCoachResponse(valid, content).misconceptions).toEqual(['Bir eksik sayılmış olabilir.', null])
    expect(() => parseCoachResponse(valid.replace('null', '"Doğru işlem."'), content)).toThrow(/correct option/)
    expect(() => parseCoachResponse(valid.replace('"Bir eksik sayılmış olabilir."', 'null'), content)).toThrow(/wrong option/)
    expect(() => parseCoachResponse(valid.replace('"Bir eksik sayılmış olabilir."', '""'), content)).toThrow(/wrong option/)
    expect(() => parseCoachResponse(valid.replace('"hint1"', '"unknown"'), content)).toThrow(/unexpected keys/)
  })

  it('requires two independent approvals, zero critical errors and 18/20 per quality dimension', () => {
    const contentJson = JSON.stringify({
      question: '2 + 2?',
      options: ['3', '4'],
      answer: 1,
      solution: 'İki sayı toplanır.',
    })
    const pool = Array.from({ length: 25 }, (_, index) => ({
      ...candidate(index + 1),
      contentSha256: sha256Hex(contentJson),
      optionCount: 2,
    }))
    const manifest = buildPilotManifest(pool, 20)
    const sources = manifest.items.map((item) => ({
      questionId: item.questionId,
      revisionId: item.revisionId,
      contentSha256: item.contentSha256,
      outcomeTitle: 'Doğal sayılarla toplama yapar.',
      contentJson,
    }))
    const staging = manifest.items.map((item, index) => ({
      schemaVersion: STAGING_SCHEMA,
      manifestSha256: manifest.manifestSha256,
      questionId: item.questionId,
      revisionId: item.revisionId,
      contentSha256: item.contentSha256,
      model: 'test-model',
      generatedAt: '2026-08-11T00:00:00.000Z',
      rawResponseSha256: sha256Hex(`response-${index}`),
      validatorVersion: VALIDATOR_VERSION,
      coach: {
        misconceptions: ['Bir eksik sayılmış olabilir.', null],
        hint1: 'İki grubu birleştir.',
        hint2: 'Toplama işlemini kur.',
        miniExample: '1 + 2 örneğinde iki grup birleştirilir ve üç bulunur.',
      },
    }))
    const review = buildReviewTemplate(manifest, sources, staging)
    review.reviewers.subject = { id: 'curator-1', name: 'Konu küratörü' }
    review.reviewers.contractSecurity = { id: 'reviewer-2', name: 'Sözleşme kontrolü' }
    for (const item of review.items) {
      item.subject.decision = 'approved'
      for (const dimension of Object.keys(item.subject.ratings)) item.subject.ratings[dimension] = true
      item.contractSecurity.decision = 'approved'
      item.contractSecurity.contractValid = true
    }
    expect(evaluatePilotReview(manifest, review, staging).accepted).toBe(true)

    review.items[0].contractSecurity.criticalErrors.push('answer_leak')
    expect(evaluatePilotReview(manifest, review, staging)).toMatchObject({ accepted: false, criticalErrorCount: 1 })
    review.items[0].contractSecurity.criticalErrors = []
    review.items[0].stagingRecordSha256 = '0'.repeat(64)
    expect(evaluatePilotReview(manifest, review, staging).errors).toContain(
      `review is not bound to staging record ${review.items[0].revisionId}`,
    )
  })

  it('keeps discovery text-free and generation staging-only', () => {
    expect(discover).toContain('--input')
    expect(discover).toContain('--output')
    expect(discover).not.toContain("from('questions')")
    expect(discover).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(generator).toContain('--manifest')
    expect(generator).toContain('--source')
    expect(generator).toContain('--output')
    expect(generator).not.toContain('@supabase/supabase-js')
    expect(generator).not.toContain(".update(")
    expect(generator).not.toContain('.env.local')
    expect(generator).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(reviewBuilder).toContain('--staging')
    expect(reviewBuilder).toContain('buildReviewTemplate')
    expect(pilotValidator).toContain('validateStagingBundle')
    expect(pilotValidator).toContain('--source')
    expect(pilotValidator).toContain('--staging')
  })
})

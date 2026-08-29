import { describe, expect, it } from 'vitest'
import { parseDiagnosticResponse } from '../public-contract'

const question = {
  id: '20000000-0000-4000-8000-000000000001',
  game: 'matematik',
  category: 'sayilar',
  subcategory: null,
  topic: null,
  difficulty: 3,
  level_tag: null,
  base_points: 30,
  content: { question: '2 + 2?', options: ['3', '4', '5', '6'] },
}

function response() {
  return {
    supported: true,
    game: 'matematik',
    examRef: 'TYT',
    policy: { version: 'adaptive-diagnostic-v3', questionCount: 10, outcomeCount: 6, maxPerOutcome: 2 },
    session: {
      id: '22222222-3333-4444-8555-666666666666',
      kind: 'initial',
      status: 'active',
      expiresAt: '2099-08-08T12:00:00.000Z',
      progress: { answered: 0, total: 10, coveredOutcomes: 0, totalOutcomes: 6 },
      question,
    },
    summary: null,
  }
}

describe('parseDiagnosticResponse', () => {
  it('accepts the exact public active-session contract', () => {
    expect(parseDiagnosticResponse(response())).toEqual(response())
  })

  it('rejects answer fields, internal IDs, invalid progress, and state/question mismatches', () => {
    expect(parseDiagnosticResponse({
      ...response(),
      session: { ...response().session, question: { ...question, content: { ...question.content, answer: 1 } } },
    })).toBeNull()
    expect(parseDiagnosticResponse({ ...response(), userId: 'secret' })).toBeNull()
    expect(parseDiagnosticResponse({
      ...response(), session: { ...response().session, progress: { answered: 0, total: 10, coveredOutcomes: 1, totalOutcomes: 6 } },
    })).toBeNull()
    expect(parseDiagnosticResponse({
      ...response(), session: { ...response().session, status: 'completed' },
    })).toBeNull()
  })

  it('requires unsupported scopes to be empty and summaries to contain six unique outcomes', () => {
    expect(parseDiagnosticResponse({ ...response(), supported: false })).toBeNull()
    const outcome = {
      code: 'MAT-SAY-01', title: 'Sayılar', category: 'sayilar', attempts: 1,
      correctAttempts: 1, score: 100, recommendedDifficulty: 4, band: 'strong',
    }
    expect(parseDiagnosticResponse({
      supported: true,
      game: 'matematik',
      examRef: 'TYT',
      policy: { version: 'adaptive-diagnostic-v3', questionCount: 10, outcomeCount: 6, maxPerOutcome: 2 },
      session: null,
      summary: { completedAt: '2026-08-08T12:00:00.000Z', outcomes: Array(6).fill(outcome) },
    })).toBeNull()
    expect(parseDiagnosticResponse({
      supported: false, game: 'fen', examRef: 'TYT', policy: null, session: null, summary: null,
    })).not.toBeNull()
  })

  it('accepts dynamic scope bounds and multiple outcomes in one subject category', () => {
    const outcomes = Array.from({ length: 3 }, (_, index) => ({
      code: `FEN-${index}`, title: `Fen alanı ${index}`, category: 'fizik', attempts: 2,
      correctAttempts: 1, score: 50, recommendedDifficulty: 3, band: 'developing',
    }))
    expect(parseDiagnosticResponse({
      supported: true,
      game: 'fen',
      examRef: 'TYT',
      policy: { version: 'adaptive-diagnostic-v3', questionCount: 6, outcomeCount: 3, maxPerOutcome: 2 },
      session: null,
      summary: { completedAt: '2026-08-08T12:00:00.000Z', outcomes },
    })).not.toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { replaySocialPilotSession, type SocialPilotResponse } from '../social-pilot-session'
import { SOCIAL_PILOT_CATEGORIES } from '../social-pilot'
import type { QuestionRow } from '../../question-audit/question-source'

function fixtures(): QuestionRow[] {
  return SOCIAL_PILOT_CATEGORIES.flatMap((category, categoryIndex) =>
    [1, 2, 3, 3, 4, 5].map((difficulty, index) => ({
      id: `${category}-${index}`, published_revision_id: `${category}-revision-${index}`,
      content_sha256: (categoryIndex * 6 + index + 1).toString(16).padStart(64, '0'),
      game: 'sosyal', exam_ref: 'TYT', category, difficulty,
      content: { question: 'Örnek?', passage: 'Ortak metin.',
        options: ['A', 'B', 'C', 'D', 'E'], answer: index % 5, solution: 'SECRET_SOLUTION' },
    })))
}

function responseFor(next: NonNullable<ReturnType<typeof replaySocialPilotSession>['nextQuestion']>,
  selectedOptionIndex = 0): SocialPilotResponse {
  return { questionId: next.questionId, revisionId: next.revisionId,
    contentSha256: next.contentSha256, selectedOptionIndex }
}

describe('offline social pilot session contract', () => {
  it.each([true, false])('replays 12 unique, pinned responses and covers each category (correct=%s)', correct => {
    const rows = fixtures()
    const original = structuredClone(rows)
    const responses: SocialPilotResponse[] = []
    const input = { rows, seed: 'stable-session', responses }
    for (let index = 0; index < 12; index++) {
      const state = replaySocialPilotSession(input)
      expect(state.completed).toBe(false)
      expect(state.observations).toBeNull()
      expect(state.answeredCount).toBe(index)
      const next = state.nextQuestion!
      const answer = rows.find(row => row.id === next.questionId)!.content!.answer as number
      responses.push(responseFor(next, correct ? answer : (answer + 1) % 5))
    }
    const result = replaySocialPilotSession(input)
    expect(result).toMatchObject({ completed: true, nextQuestion: null, answeredCount: 12,
      runtimeEnabled: false, publicationAuthorized: false, masteryWriteAllowed: false })
    expect(new Set(responses.map(response => response.questionId)).size).toBe(12)
    expect(result.observations).toEqual(SOCIAL_PILOT_CATEGORIES.map(category => ({
      category, answered: 3, correct: correct ? 3 : 0,
    })))
    expect(replaySocialPilotSession({ ...input, rows: [...rows].reverse() })).toEqual(result)
    expect(rows).toEqual(original)
  })

  it('does not expose the answer key or solution, and returns detached option arrays', () => {
    const input = { rows: fixtures(), seed: 'one', responses: [] }
    const result = replaySocialPilotSession(input)
    expect(JSON.stringify(result)).not.toContain('SECRET_SOLUTION')
    expect(result.nextQuestion).not.toHaveProperty('markedAnswerIndex')
    expect(result.nextQuestion).not.toHaveProperty('content')
    expect(result.nextQuestion!.passage).toBe('Ortak metin.')
    result.nextQuestion!.options[0] = 'changed'
    expect(replaySocialPilotSession(input).nextQuestion!.options[0]).toBe('A')
  })

  it.each(['revision', 'hash', 'order', 'outside', 'duplicate', 'negative', 'large', 'fraction', 'nan'])
    ('rejects tampered response: %s', fault => {
      const input = { rows: fixtures(), seed: 'one', responses: [] as SocialPilotResponse[] }
      const response = responseFor(replaySocialPilotSession(input).nextQuestion!)
      if (fault === 'revision') response.revisionId = 'different'
      if (fault === 'hash') response.contentSha256 = 'f'.repeat(64)
      if (fault === 'order') response.questionId = 'sosyoloji-0'
      if (fault === 'outside') response.questionId = 'not-in-pilot'
      if (fault === 'negative') response.selectedOptionIndex = -1
      if (fault === 'large') response.selectedOptionIndex = 5
      if (fault === 'fraction') response.selectedOptionIndex = 1.5
      if (fault === 'nan') response.selectedOptionIndex = NaN
      input.responses.push(response)
      if (fault === 'duplicate') input.responses.push(response)
      expect(() => replaySocialPilotSession(input)).toThrow()
    })

  it('rejects empty seeds and overlong sessions', () => {
    const input = { rows: fixtures(), seed: ' ', responses: [] }
    expect(() => replaySocialPilotSession(input)).toThrow('Invalid pilot session')
    expect(() => replaySocialPilotSession({ ...input, seed: 'one',
      responses: Array(13).fill({}) })).toThrow('Invalid pilot session')
  })
})

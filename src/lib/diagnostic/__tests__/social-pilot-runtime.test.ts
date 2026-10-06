import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseSocialPilotContext, publicSocialPilotContext } from '../social-pilot-runtime'
import { parseSocialPilotPublic } from '../social-pilot-public'
import { replaySocialPilotSession } from '../social-pilot-session'
import { SOCIAL_PILOT_CATEGORIES } from '../social-pilot'

function context() {
  const rows = SOCIAL_PILOT_CATEGORIES.flatMap((category, ci) => [1, 2, 3, 3, 4, 5].map((difficulty, i) => ({
    id: randomUUID(), published_revision_id: randomUUID(), content_sha256: (ci * 6 + i + 1).toString(16).padStart(64, '0'),
    game: 'sosyal' as const, exam_ref: 'TYT' as const, category, difficulty,
    content: { question: 'Örnek soru?', options: ['A', 'B', 'C', 'D', 'E'], answer: 1, solution: 'SECRET' },
  })))
  const id = randomUUID()
  const replay = replaySocialPilotSession({ rows, seed: id, responses: [] })
  return { enabled: true, packId: randomUUID(), rows,
    session: { id, status: 'active' as const, expiresAt: '2099-09-30T12:00:00+03:00',
      currentQuestionId: replay.nextQuestion!.questionId, answeredCount: 0, rows, responses: [] } }
}

describe('social pilot server snapshot boundary', () => {
  it('accepts a coherent snapshot and returns an answer-free strict public projection', () => {
    const result = publicSocialPilotContext(parseSocialPilotContext(context()))
    expect(result.session?.question).toBeTruthy()
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(result.session?.question).not.toHaveProperty('answer')
    expect(result.session?.question).not.toHaveProperty('revisionId')
    expect(parseSocialPilotPublic(result)).toEqual(result)
    expect(parseSocialPilotPublic({ ...result, answer: 1 })).toBeNull()
  })
  it.each(['progress', 'question', 'status', 'catalog', 'hash', 'disabled'])('rejects incoherent snapshot: %s', fault => {
    const raw: Record<string, unknown> = context()
    const session = raw.session as Record<string, unknown>
    if (fault === 'progress') session.answeredCount = 1
    if (fault === 'question') session.currentQuestionId = randomUUID()
    if (fault === 'status') session.status = 'completed'
    if (fault === 'catalog') raw.rows = []
    if (fault === 'hash') (raw.rows as { content_sha256: string }[])[0].content_sha256 = 'bad'
    if (fault === 'disabled') raw.enabled = false
    expect(() => parseSocialPilotContext(raw)).toThrow()
  })
  it('expires an active snapshot without revealing a question', () => {
    const raw = context()
    raw.session.expiresAt = '2020-01-01T00:00:00Z'
    expect(publicSocialPilotContext(parseSocialPilotContext(raw)).session).toMatchObject({
      status: 'expired', question: null, observations: null,
    })
  })
  it('accepts an unpublished pilot without treating it as an empty active session', () => {
    const parsed = parseSocialPilotContext({ enabled: false, packId: null, rows: [], session: null })
    expect(publicSocialPilotContext(parsed)).toMatchObject({ supported: false, session: null })
  })
  it('rejects a session catalog that differs from its released pack', () => {
    const raw = context()
    raw.session.rows = raw.session.rows.map((row, i) => i === 0
      ? { ...row, content: { ...row.content, solution: 'DIFFERENT' } } : row)
    expect(() => parseSocialPilotContext(raw)).toThrow('catalog/session mismatch')
  })
})

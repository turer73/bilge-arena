import { describe, expect, it } from 'vitest'
import { excludeSocialPilotHolds, prepareSocialPilot, SOCIAL_PILOT_CATEGORIES } from '../social-pilot'
import { selectNextDiagnosticQuestion, type DiagnosticAnswerInput } from '../adaptive-policy'
import type { QuestionRow } from '../../question-audit/question-source'

function fixtures(): QuestionRow[] {
  return SOCIAL_PILOT_CATEGORIES.flatMap(category => [1, 2, 3, 3, 4, 5].map((difficulty, i) => ({
    id: `${category}-${i}`, published_revision_id: `${category}-revision-${i}`,
    content_sha256: (SOCIAL_PILOT_CATEGORIES.indexOf(category) * 6 + i + 1).toString(16).padStart(64, '0'), game: 'sosyal', exam_ref: 'TYT', category, difficulty,
    content: { question: 'Örnek soru?', options: ['A', 'B', 'C', 'D', 'E'], answer: 0, solution: 'Örnek çözüm.' },
  })))
}

describe('social four-domain review pilot', () => {
  const holdFor = (row: QuestionRow) => ({ questionId: row.id, revisionId: row.published_revision_id!,
    contentSha256: row.content_sha256!, reason: 'Source review pending: ambiguous wording' })
  it('excludes held revisions without mutation and refuses to hide the resulting quota gap', () => {
    const rows = fixtures()
    const holds = [holdFor(rows[0])]
    expect(excludeSocialPilotHolds(rows, holds).rows).toHaveLength(23)
    expect(rows).toHaveLength(24)
    expect(() => prepareSocialPilot(rows, holds)).toThrow('Insufficient candidates: tarih:easy')
    rows.push({ ...rows[0], id: 'replacement', published_revision_id: 'replacement-revision', content_sha256: 'c'.repeat(64) })
    const pilot = prepareSocialPilot(rows, holds)
    expect(pilot.rows.some(row => row.id === holds[0].questionId)).toBe(false)
    expect(pilot.manifest.holds).toEqual(holds)
    expect(pilot.manifest.publicationAuthorized).toBe(false)
  })
  it('does not reintroduce held content under another question ID', () => {
    const rows = fixtures()
    const holds = [holdFor(rows[0])]
    rows.push({ ...rows[0], id: 'clone', published_revision_id: 'clone-revision' })
    expect(() => prepareSocialPilot(rows, holds)).toThrow('Insufficient candidates')
  })
  it('rejects identical content selected under different identities', () => {
    const rows = fixtures()
    rows[1].content_sha256 = rows[0].content_sha256
    expect(() => prepareSocialPilot(rows)).toThrow('Duplicate selected content')
  })
  it.each(['null', 'duplicate', 'unknown', 'revision', 'hash', 'reason', 'extra'])('rejects invalid hold: %s', fault => {
    const rows = fixtures()
    const hold = holdFor(rows[0])
    if (fault === 'unknown') hold.questionId = 'unknown'
    if (fault === 'revision') hold.revisionId = 'changed'
    if (fault === 'hash') hold.contentSha256 = 'b'.repeat(64)
    if (fault === 'reason') hold.reason = ' '
    const holds = fault === 'null' ? null : fault === 'duplicate' ? [hold, hold]
      : fault === 'extra' ? [{ ...hold, approved: true }] : [hold]
    expect(() => prepareSocialPilot(rows, holds)).toThrow()
  })
  it('selects reproducibly, records coverage and never grants release authority', () => {
    const pilot = prepareSocialPilot(fixtures())
    expect(prepareSocialPilot(fixtures().reverse())).toEqual(pilot)
    expect(pilot.rows).toHaveLength(24)
    expect(pilot.manifest).toMatchObject({ runtimeEnabled: false, publicationAuthorized: false, candidateEvidenceOnly: true })
    expect(pilot.manifest.coverage).toHaveLength(12)
  })
  it.each(['scope', 'hash', 'revision', 'duplicate', 'difficulty', 'options', 'answer', 'quota'])('fails closed for %s', fault => {
    const rows = fixtures()
    if (fault === 'scope') rows[0].category = 'din_kulturu'
    if (fault === 'hash') rows[0].content_sha256 = 'wrong'
    if (fault === 'revision') rows[0].published_revision_id = null
    if (fault === 'duplicate') rows.push(rows[0])
    if (fault === 'difficulty') rows[0].difficulty = 0
    if (fault === 'options') rows[0].content!.options = ['A', 'B', 'C', 'D']
    if (fault === 'answer') rows[0].content!.answer = 5
    if (fault === 'quota') rows.pop()
    expect(() => prepareSocialPilot(rows)).toThrow()
  })
  it.each([true, false])('reuses adaptive policy for a 12-item simulation (answers=%s)', isCorrect => {
    const { rows } = prepareSocialPilot(fixtures())
    const answers: DiagnosticAnswerInput[] = []
    const config = { kind: 'initial' as const, seed: 'pilot-test', questionCount: 12, maxPerOutcome: 3,
      // Synthetic simulation IDs only; these are NOT curriculum outcome mappings.
      outcomes: SOCIAL_PILOT_CATEGORIES.map((id, sortOrder) => ({ id, sortOrder })),
      questions: rows.map(row => ({ id: row.id, outcomeId: row.category, difficulty: row.difficulty! })),
      priorStates: [], answers }
    for (let i = 0; i < 12; i++) {
      const next = selectNextDiagnosticQuestion(config)
      expect(next).not.toBeNull()
      const question = config.questions.find(q => q.id === next!.questionId)!
      answers.push({ questionId: question.id, outcomeId: question.outcomeId, difficulty: question.difficulty, isCorrect })
    }
    expect(selectNextDiagnosticQuestion(config)).toBeNull()
    expect(new Set(answers.map(a => a.questionId)).size).toBe(12)
    for (const category of SOCIAL_PILOT_CATEGORIES) expect(answers.filter(a => a.outcomeId === category)).toHaveLength(3)
  })
})

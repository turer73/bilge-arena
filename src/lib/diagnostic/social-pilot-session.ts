import { selectNextDiagnosticQuestion, type DiagnosticAnswerInput } from './adaptive-policy'
import { prepareSocialPilot, SOCIAL_PILOT_CATEGORIES } from './social-pilot'
import { toDraft, type QuestionRow } from '../question-audit/question-source'

export interface SocialPilotResponse {
  questionId: string
  revisionId: string
  contentSha256: string
  selectedOptionIndex: number
}

/** Offline session replay, NOT a public endpoint or publication gate.
 * The adapter must load rows and responses from trusted server snapshots before
 * using this contract online. Category IDs are selection buckets, never mastery
 * outcome IDs. Correctness is computed here, never accepted from the client.
 */
export function replaySocialPilotSession(input: {
  rows: readonly QuestionRow[]
  holds?: unknown
  seed: string
  responses: readonly SocialPilotResponse[]
}) {
  if (!input.seed.trim() || input.responses.length > 12) throw new Error('Invalid pilot session')
  const pilot = prepareSocialPilot(input.rows, input.holds ?? [])
  const questions = pilot.rows.map(row => ({ id: row.id, outcomeId: row.category,
    difficulty: row.difficulty! }))
  const answers: DiagnosticAnswerInput[] = []
  const policy = {
    kind: 'initial' as const, seed: input.seed, questionCount: 12, maxPerOutcome: 3,
    outcomes: SOCIAL_PILOT_CATEGORIES.map((id, sortOrder) => ({ id, sortOrder })),
    questions, priorStates: [], answers,
  }
  for (const response of input.responses) {
    const expected = selectNextDiagnosticQuestion(policy)
    if (!expected || expected.questionId !== response.questionId) {
      throw new Error('Unexpected pilot response order')
    }
    const row = pilot.rows.find(row => row.id === expected.questionId)!
    if (response.revisionId !== row.published_revision_id
      || response.contentSha256 !== row.content_sha256) throw new Error('Pilot revision mismatch')
    const draft = toDraft(row, { strictExamOptionCount: true })
    if (!draft.ok) throw new Error('Invalid pilot question')
    if (!Number.isInteger(response.selectedOptionIndex) || response.selectedOptionIndex < 0
      || response.selectedOptionIndex >= draft.draft.options.length) throw new Error('Invalid pilot option')
    answers.push({ questionId: row.id, outcomeId: row.category, difficulty: row.difficulty!,
      isCorrect: response.selectedOptionIndex === draft.draft.markedAnswerIndex })
  }
  const selection = selectNextDiagnosticQuestion(policy)
  const row = selection ? pilot.rows.find(row => row.id === selection.questionId)! : null
  const converted = row ? toDraft(row, { strictExamOptionCount: true }) : null
  if (converted && !converted.ok) throw new Error('Invalid pilot question')
  const completed = input.responses.length === 12
  if (!completed && !selection) throw new Error('Pilot candidate exhaustion')
  return {
    version: 'social-pilot-session@1' as const,
    mode: 'offline_replay' as const,
    runtimeEnabled: false as const,
    publicationAuthorized: false as const,
    masteryWriteAllowed: false as const,
    disclaimer: pilot.manifest.disclaimer,
    answeredCount: answers.length,
    questionCount: 12,
    completed,
    // Explicit allowlist: never serialize row.content or the full audit draft.
    nextQuestion: row && converted?.ok ? {
      questionId: row.id, revisionId: row.published_revision_id!, contentSha256: row.content_sha256!,
      category: row.category, questionText: converted.draft.questionText,
      passage: converted.draft.passage, options: [...converted.draft.options],
    } : null,
    // Raw observations only. Three items do not establish domain mastery.
    observations: completed ? SOCIAL_PILOT_CATEGORIES.map(category => ({
      category, answered: answers.filter(answer => answer.outcomeId === category).length,
      correct: answers.filter(answer => answer.outcomeId === category && answer.isCorrect).length,
    })) : null,
  }
}

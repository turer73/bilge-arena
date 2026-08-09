import { CURRICULUM_NODE_TYPES, type PublicCurriculumNode } from './graph'
import type { MasteryStatus } from './status'

export interface MasteryOutcomePublic {
  code: string
  nodeCode: string
  path: string[]
  title: string
  description: string | null
  game: string
  category: string
  examRef: string | null
  attempts: number
  correctAttempts: number
  weightedEarned: number
  weightedPossible: number
  delayedCorrect: number
  accuracy: number
  rawAccuracy: number
  difficultyAccuracy: number
  averageTimeSec: number | null
  fastWrongRate: number
  hintRate: number
  averageHintStage: number | null
  guessRisk: number
  carelessRisk: number
  evidenceCompleteness: number
  score: number
  status: MasteryStatus
  modelVersion: 'legacy-v1' | 'evidence-v2'
  components: {
    accuracy: number
    delayedRetrieval: number
    independence: number
    selfRegulation: number
  }
  lastAnsweredAt: string | null
}

export interface MasteryCoveragePublic {
  supported: boolean
  taxonomyVersion: string | null
  totalQuestions: number
  mappedQuestions: number
  percentage: number
}

export interface MasteryMapResponsePublic {
  game: string
  examRef: string | null
  coverage: MasteryCoveragePublic
  graph: PublicCurriculumNode | null
  outcomes: MasteryOutcomePublic[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finitePercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed)
  return Object.keys(value).every((key) => allowedSet.has(key))
}

function validGraphNode(
  value: unknown,
  depth: number,
  nodeCodes: Set<string>,
  leaves: Map<string, { nodeCode: string; path: string[] }>,
  path: string[],
): value is PublicCurriculumNode {
  if (depth > 3 || !isRecord(value)) return false
  if (!hasOnlyKeys(value, ['code', 'title', 'nodeType', 'outcomeCode', 'children'])) return false
  const expectedType = CURRICULUM_NODE_TYPES[depth]
  if (
    typeof value.code !== 'string' || !value.code
    || typeof value.title !== 'string' || !value.title
    || value.nodeType !== expectedType
    || !Array.isArray(value.children)
    || nodeCodes.has(value.code)
  ) return false
  nodeCodes.add(value.code)
  const nextPath = [...path, value.title]
  if (expectedType === 'outcome') {
    if (typeof value.outcomeCode !== 'string' || !value.outcomeCode || value.children.length !== 0) return false
    if (leaves.has(value.outcomeCode)) return false
    leaves.set(value.outcomeCode, { nodeCode: value.code, path: nextPath })
    return true
  }
  if (value.outcomeCode !== undefined || value.children.length === 0) return false
  return value.children.every((child) => validGraphNode(child, depth + 1, nodeCodes, leaves, nextPath))
}

function validOutcome(value: unknown): value is MasteryOutcomePublic {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, [
    'code', 'nodeCode', 'path', 'title', 'description', 'game', 'category', 'examRef',
    'attempts', 'correctAttempts', 'weightedEarned', 'weightedPossible', 'delayedCorrect',
    'accuracy', 'rawAccuracy', 'difficultyAccuracy', 'averageTimeSec', 'fastWrongRate',
    'hintRate', 'averageHintStage', 'guessRisk', 'carelessRisk', 'evidenceCompleteness',
    'score', 'status', 'modelVersion', 'components', 'lastAnsweredAt',
  ])) return false
  const stringFields = ['code', 'nodeCode', 'title', 'game', 'category']
  if (stringFields.some((field) => typeof value[field] !== 'string')) return false
  if (!Array.isArray(value.path) || value.path.length !== 4 || !value.path.every((part) => typeof part === 'string' && part.length > 0)) return false
  if (value.description !== null && typeof value.description !== 'string') return false
  if (value.examRef !== null && typeof value.examRef !== 'string') return false
  if (value.lastAnsweredAt !== null && (
    typeof value.lastAnsweredAt !== 'string' || !Number.isFinite(Date.parse(value.lastAnsweredAt))
  )) return false
  if (!['insufficient', 'developing', 'mastered'].includes(String(value.status))) return false
  if (!['legacy-v1', 'evidence-v2'].includes(String(value.modelVersion))) return false
  const countFields = [
    'attempts', 'correctAttempts', 'weightedEarned', 'weightedPossible', 'delayedCorrect',
  ]
  if (countFields.some((field) => typeof value[field] !== 'number' || !Number.isFinite(value[field] as number) || Number(value[field]) < 0)) {
    return false
  }
  const attempts = Number(value.attempts)
  const correctAttempts = Number(value.correctAttempts)
  const delayedCorrect = Number(value.delayedCorrect)
  const weightedEarned = Number(value.weightedEarned)
  const weightedPossible = Number(value.weightedPossible)
  if (
    !Number.isInteger(attempts)
    || !Number.isInteger(correctAttempts)
    || !Number.isInteger(delayedCorrect)
    || correctAttempts > attempts
    || delayedCorrect > correctAttempts
    || weightedEarned > weightedPossible
  ) return false
  const percentFields = [
    'accuracy', 'rawAccuracy', 'difficultyAccuracy', 'fastWrongRate', 'hintRate',
    'guessRisk', 'carelessRisk', 'evidenceCompleteness', 'score',
  ]
  if (percentFields.some((field) => !finitePercent(value[field]))) return false
  if (value.accuracy !== value.rawAccuracy) return false
  if (value.averageTimeSec !== null && (
    typeof value.averageTimeSec !== 'number' || !Number.isFinite(value.averageTimeSec) || value.averageTimeSec < 0
  )) return false
  if (value.averageHintStage !== null && (
    typeof value.averageHintStage !== 'number' || value.averageHintStage < 0 || value.averageHintStage > 4
  )) return false
  const components = value.components
  if (!isRecord(components) || !hasOnlyKeys(components, ['accuracy', 'delayedRetrieval', 'independence', 'selfRegulation'])) return false
  if (!['accuracy', 'delayedRetrieval', 'independence', 'selfRegulation']
    .every((field) => finitePercent(components[field]))) return false
  return value.score === Object.values(components)
    .map(Number)
    .reduce((sum: number, component) => sum + component, 0)
}

export function parseMasteryMapResponse(value: unknown): MasteryMapResponsePublic | null {
  if (!isRecord(value)) return null
  if (!hasOnlyKeys(value, ['game', 'examRef', 'coverage', 'graph', 'outcomes'])) return null
  if (
    typeof value.game !== 'string'
    || (value.examRef !== null && typeof value.examRef !== 'string')
    || !isRecord(value.coverage)
    || !hasOnlyKeys(value.coverage, ['supported', 'taxonomyVersion', 'totalQuestions', 'mappedQuestions', 'percentage'])
    || typeof value.coverage.supported !== 'boolean'
    || (value.coverage.taxonomyVersion !== null && typeof value.coverage.taxonomyVersion !== 'string')
    || typeof value.coverage.totalQuestions !== 'number'
    || typeof value.coverage.mappedQuestions !== 'number'
    || !Number.isInteger(value.coverage.totalQuestions)
    || !Number.isInteger(value.coverage.mappedQuestions)
    || value.coverage.totalQuestions < 0
    || value.coverage.mappedQuestions < 0
    || value.coverage.mappedQuestions > value.coverage.totalQuestions
    || !finitePercent(value.coverage.percentage)
    || !Array.isArray(value.outcomes)
    || !value.outcomes.every(validOutcome)
  ) return null

  const expectedPercentage = value.coverage.totalQuestions > 0
    ? Math.round((value.coverage.mappedQuestions / value.coverage.totalQuestions) * 100)
    : 0
  if (value.coverage.percentage !== expectedPercentage) return null

  if (!value.coverage.supported) {
    if (
      value.coverage.taxonomyVersion !== null
      || value.coverage.totalQuestions !== 0
      || value.coverage.mappedQuestions !== 0
      || value.graph !== null
      || value.outcomes.length !== 0
    ) return null
    return value as unknown as MasteryMapResponsePublic
  }

  if (
    typeof value.coverage.taxonomyVersion !== 'string'
    || !value.coverage.taxonomyVersion
    || value.coverage.mappedQuestions !== value.coverage.totalQuestions
    || value.graph === null
  ) return null

  const leaves = new Map<string, { nodeCode: string; path: string[] }>()
  if (!validGraphNode(value.graph, 0, new Set(), leaves, [])) return null
  const seenOutcomes = new Set<string>()
  for (const outcome of value.outcomes as MasteryOutcomePublic[]) {
    if (seenOutcomes.has(outcome.code)) return null
    seenOutcomes.add(outcome.code)
    const leaf = leaves.get(outcome.code)
    if (!leaf || leaf.nodeCode !== outcome.nodeCode || leaf.path.some((part, index) => part !== outcome.path[index])) {
      return null
    }
  }
  if (seenOutcomes.size !== leaves.size) return null

  return value as unknown as MasteryMapResponsePublic
}

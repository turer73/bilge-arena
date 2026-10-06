import { buildMasteryDiscovery } from './discovery'
import { indexPublicCurriculumLeaves, type PublicCurriculumNode } from './graph'
import { summarizeLearningStatus } from './learning-status'
import { parseMasteryMapResponse, type MasteryMapResponsePublic } from './public-contract'
import { isMasteryScopeIntegrityClean, parseMasteryScopeIntegrity, type ReleasedMasteryScope } from './scope'
import { isCompleteMasteryStateRow, toMasteryStateInput, type MasteryStateRow } from './state-row'
import type { PlanOutcomeDefinition } from '@/lib/study/outcome-targets'

interface CanonicalItem {
  canonicalId: string
  programKey: string
  programEdition: string
  grade: number
  officialCode: string
  title: string
  path: Array<{ nodeType: string; title: string; officialCode?: string | null }>
  aliases: Array<{ id: string; code: string; category: string }>
}

export interface CanonicalMasteryContext {
  format: 'canonical-mastery@1'
  game: string
  examRef: 'LGS'
  taxonomyVersion: string
  integrity: NonNullable<ReturnType<typeof parseMasteryScopeIntegrity>>
  items: CanonicalItem[]
  states: MasteryStateRow[]
}

function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
function keys(v: Record<string, unknown>, allowed: string[]) {
  return Object.keys(v).every(k => allowed.includes(k))
}
function text(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0 }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate a released server read; a structural catalog alone never qualifies. */
export function parseCanonicalMasteryContext(value: unknown, scope: ReleasedMasteryScope): CanonicalMasteryContext | null {
  if (scope.mappingMode !== 'canonical_reviewed' || scope.displayExamRef !== 'LGS'
    || scope.questionExamRef !== 'LGS' || scope.diagnosticEnabled
    || !record(value) || !keys(value, ['format', 'game', 'examRef', 'taxonomyVersion', 'integrity', 'items', 'states'])
    || value.format !== 'canonical-mastery@1' || value.game !== scope.game
    || value.examRef !== scope.displayExamRef || value.taxonomyVersion !== scope.taxonomyVersion
    || !Array.isArray(value.items) || value.items.length === 0 || value.items.length > 1000
    || !Array.isArray(value.states)) return null
  if (!isMasteryScopeIntegrityClean(parseMasteryScopeIntegrity(value.integrity))) return null
  const canonicalIds = new Set<string>(), aliasIds = new Set<string>(), aliasCodes = new Set<string>()
  for (const item of value.items) {
    if (!record(item) || !keys(item, ['canonicalId', 'programKey', 'programEdition', 'grade', 'officialCode', 'title', 'path', 'aliases'])
      || !text(item.canonicalId) || item.canonicalId.length > 200 || canonicalIds.has(item.canonicalId)
      || !text(item.programKey) || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(item.programKey)
      || !text(item.programEdition) || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(item.programEdition)
      || !Number.isInteger(item.grade) || Number(item.grade) < 1 || Number(item.grade) > 12
      || !text(item.officialCode) || !/^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{1,80}$/.test(item.officialCode)
      || item.canonicalId !== `${item.programKey}@${item.programEdition}:grade${item.grade}:LGS:${item.officialCode}`
      || !text(item.title) || item.title.length > 400
      || !Array.isArray(item.path) || item.path.length < 2 || item.path.length > 8
      || !Array.isArray(item.aliases) || item.aliases.length === 0) return null
    canonicalIds.add(item.canonicalId)
    for (const [i, part] of item.path.entries()) {
      if (!record(part) || !keys(part, ['nodeType', 'title', 'officialCode']) || !text(part.title) || part.title.length > 400
        || (part.officialCode !== undefined && part.officialCode !== null && !text(part.officialCode))) return null
      if (i === 0 ? part.nodeType !== 'course'
        : i === item.path.length - 1
          ? part.nodeType !== 'outcome' || part.officialCode !== item.officialCode || part.title !== item.title
          : !['unit', 'topic', 'learning_area', 'language_skill'].includes(String(part.nodeType))) return null
    }
    for (const alias of item.aliases) {
      if (!record(alias) || !keys(alias, ['id', 'code', 'category'])
        || !text(alias.id) || !UUID.test(alias.id) || aliasIds.has(alias.id)
        || !text(alias.code) || aliasCodes.has(alias.code) || !text(alias.category)) return null
      aliasIds.add(alias.id); aliasCodes.add(alias.code)
    }
  }
  const stateIds = new Set<string>()
  for (const state of value.states) {
    if (!isCompleteMasteryStateRow(state) || !canonicalIds.has(state.outcome_id) || stateIds.has(state.outcome_id)) return null
    stateIds.add(state.outcome_id)
    const s = toMasteryStateInput(state)
    if (![s.attempts, s.correctAttempts, s.delayedCorrect, s.v2Attempts, s.timedAttempts,
      s.fastWrong, s.hintedAttempts, s.hintStageSum, s.guessAnnotations, s.carelessAnnotations, s.verifiedEvidenceDays]
      .every(Number.isSafeInteger)
      || s.v2Attempts !== s.attempts || s.correctAttempts > s.attempts || s.delayedCorrect > s.correctAttempts
      || s.verifiedEvidenceDays > s.attempts || s.weightedEarned > s.weightedPossible
      || s.difficultyWeightedEarned > s.difficultyWeightedPossible || s.timedAttempts > s.attempts
      || s.hintedAttempts > s.attempts || s.hintStageSum > s.hintedAttempts * 4
      || s.fastWrong > s.attempts - s.correctAttempts
      || s.guessAnnotations + s.carelessAnnotations > s.attempts - s.correctAttempts) return null
  }
  return value as unknown as CanonicalMasteryContext
}

/** Official variable-depth paths under one explicitly non-official collection. */
export function buildCanonicalGraph(context: CanonicalMasteryContext): PublicCurriculumNode {
  const root: PublicCurriculumNode = { code: `canonical:${context.game}:LGS`, title: 'LGS kazanım haritası', nodeType: 'collection', children: [] }
  for (const item of context.items) {
    let parent = root
    const namespace = `${item.programKey}@${item.programEdition}:grade${item.grade}:LGS`
    const prefix: Array<[string, string, string | null]> = []
    for (const part of item.path) {
      prefix.push([part.nodeType, part.title, part.officialCode ?? null])
      const code = part.nodeType === 'outcome' ? item.canonicalId : `${namespace}:${JSON.stringify(prefix)}`
      let node = parent.children.find(child => child.code === code)
      if (!node) {
        node = { code, title: part.title, nodeType: part.nodeType as PublicCurriculumNode['nodeType'],
          ...(part.nodeType === 'outcome' ? { outcomeCode: item.canonicalId } : {}), children: [] }
        parent.children.push(node)
      }
      parent = node
    }
  }
  return root
}

function emptyState(outcomeId: string) {
  return { outcomeId, attempts: 0, correctAttempts: 0, weightedEarned: 0, weightedPossible: 0,
    delayedCorrect: 0, v2Attempts: 0, difficultyWeightedEarned: 0, difficultyWeightedPossible: 0,
    timedAttempts: 0, totalTimeSec: 0, fastWrong: 0, hintedAttempts: 0, hintStageSum: 0,
    guessAnnotations: 0, carelessAnnotations: 0, verifiedEvidenceDays: 0, lastAnsweredAt: null }
}

export function buildCanonicalMasteryResponse(context: CanonicalMasteryContext): MasteryMapResponsePublic | null {
  const graph = buildCanonicalGraph(context), leaves = indexPublicCurriculumLeaves(graph)
  const states = new Map(context.states.map(row => [row.outcome_id, toMasteryStateInput(row)]))
  const outcomes = context.items.map(item => {
    const state = states.get(item.canonicalId) ?? emptyState(item.canonicalId)
    const summary = summarizeLearningStatus(state), leaf = leaves.get(item.canonicalId)!
    return { code: item.canonicalId, nodeCode: leaf.nodeCode, path: leaf.path, title: item.title,
      description: null, game: context.game, category: item.aliases[0].category, examRef: context.examRef,
      ...summary, weightedEarned: state.weightedEarned, weightedPossible: state.weightedPossible,
      accuracy: summary.rawAccuracy, lastAnsweredAt: state.lastAnsweredAt }
  })
  return parseMasteryMapResponse({ game: context.game, examRef: context.examRef,
    graphFormat: 'canonical@1', graph, outcomes, discovery: buildMasteryDiscovery(outcomes, false),
    coverage: { supported: true, diagnosticAvailable: false, taxonomyVersion: context.taxonomyVersion,
      totalQuestions: context.integrity.total, mappedQuestions: context.integrity.mapped, percentage: 100 } })
}

/** Re-key before ranking, not after: aliases must not consume two plan targets. */
export function canonicalPlanInputs(context: CanonicalMasteryContext,
  mappings: Array<{ questionId: string; outcomeId: string }>, selectedCategory: string | null) {
  const aliases = new Map(context.items.flatMap(item => item.aliases.map(alias => [alias.id, item.canonicalId] as const)))
  const outcomes: PlanOutcomeDefinition[] = context.items.map((item, index) => ({
    id: item.canonicalId, code: item.canonicalId,
    category: item.aliases.find(alias => alias.category === selectedCategory)?.category ?? item.aliases[0].category,
    sortOrder: index,
  }))
  const uniqueMappings = new Map<string, { questionId: string; outcomeId: string }>()
  for (const mapping of mappings) {
    const outcomeId = aliases.get(mapping.outcomeId)
    if (outcomeId) uniqueMappings.set(`${mapping.questionId}:${outcomeId}`, { questionId: mapping.questionId, outcomeId })
  }
  return { outcomes, outcomeStates: context.states.map(toMasteryStateInput), mappings: [...uniqueMappings.values()] }
}

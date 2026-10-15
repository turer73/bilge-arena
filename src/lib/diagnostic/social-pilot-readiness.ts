import { evaluateSourceComparison } from '../question-audit/source-comparison'
import { toDraft, type QuestionRow } from '../question-audit/question-source'
import { prepareSocialPilot } from './social-pilot'

export type CurrentSocialQuestion = QuestionRow & { is_active: boolean }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'undefined'
}

/** Offline preflight only. Inputs must come from a fresh, trusted DB export.
 * Re-evaluates raw reports; a caller-supplied "approved" summary is never proof.
 * Does not register a scope, change curriculum mappings or authorize publication.
 */
export function assessSocialPilotReadiness(input: {
  rows: readonly QuestionRow[]
  holds?: unknown
  currentRows: readonly CurrentSocialQuestion[]
  reviews: Readonly<Record<string, unknown>>
}) {
  const pilot = prepareSocialPilot(input.rows, input.holds ?? [])
  const current = new Map<string, CurrentSocialQuestion>()
  for (const row of input.currentRows) {
    if (current.has(row.id)) throw new Error('Duplicate current question')
    current.set(row.id, row)
  }
  const selectedIds = new Set(pilot.rows.map(row => row.id))
  const unexpectedReviewIds = Object.keys(input.reviews).filter(id => !selectedIds.has(id)).sort()
  const results = pilot.rows.map(row => {
    const base = { questionId: row.id, revisionId: row.published_revision_id!,
      contentSha256: row.content_sha256!, category: row.category }
    const fresh = current.get(row.id)
    if (!fresh) return { ...base, status: 'current_question_missing', issues: [], warnings: [] }
    if (fresh.is_active !== true) return { ...base, status: 'inactive', issues: [], warnings: [] }
    if (fresh.published_revision_id !== row.published_revision_id
      || fresh.content_sha256 !== row.content_sha256
      || fresh.game !== row.game || fresh.exam_ref !== row.exam_ref
      || fresh.category !== row.category || fresh.difficulty !== row.difficulty
      || canonical(fresh.content) !== canonical(row.content)) {
      return { ...base, status: 'current_revision_mismatch', issues: [], warnings: [] }
    }
    if (!Object.hasOwn(input.reviews, row.id)) return { ...base, status: 'missing', issues: [], warnings: [] }
    const converted = toDraft(row, { strictExamOptionCount: true })
    if (!converted.ok) throw new Error('Invalid selected draft')
    try {
      const result = evaluateSourceComparison(converted.draft, input.reviews[row.id])
      return { ...base, status: result.status, issues: [...result.issues, ...result.conflicts],
        warnings: result.warnings }
    } catch {
      return { ...base, status: 'invalid', issues: [], warnings: [] }
    }
  })
  const totals: Record<string, number> = {}
  for (const result of results) totals[result.status] = (totals[result.status] ?? 0) + 1
  return {
    version: 'social-pilot-readiness@1',
    candidateCount: results.length,
    sourcePackageComplete: unexpectedReviewIds.length === 0
      && results.every(result => result.status === 'evidence_complete'),
    // Even complete source declarations are not independently verified retrieval,
    // approved curriculum mappings, DB/API integration or a release decision.
    runtimeEnabled: false,
    publicationAuthorized: false,
    provenance: 'operator_supplied_export_and_source_declarations',
    unexpectedReviewIds,
    totals,
    results,
  }
}

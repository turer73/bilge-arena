import { toDraft, type QuestionRow } from '../question-audit/question-source'

export const SOCIAL_PILOT_CATEGORIES = ['tarih', 'cografya', 'felsefe', 'sosyoloji'] as const

export interface SocialPilotHold {
  questionId: string
  revisionId: string
  contentSha256: string
  reason: string
}

/** Local selection exclusions, not quality decisions or production quarantine. */
export function excludeSocialPilotHolds(rows: readonly QuestionRow[], holds: unknown) {
  if (!Array.isArray(holds)) throw new Error('Expected holds array')
  const seen = new Set<string>()
  const validated: SocialPilotHold[] = []
  for (const value of holds) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'contentSha256,questionId,reason,revisionId'
      || typeof value.questionId !== 'string' || !value.questionId
      || typeof value.revisionId !== 'string' || !value.revisionId
      || typeof value.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentSha256)
      || typeof value.reason !== 'string' || !value.reason.trim()) throw new Error('Invalid hold')
    if (seen.has(value.questionId)) throw new Error('Duplicate hold')
    const matches = rows.filter(row => row.id === value.questionId)
    if (matches.length !== 1 || matches[0].published_revision_id !== value.revisionId
      || matches[0].content_sha256 !== value.contentSha256) throw new Error('Hold revision mismatch')
    seen.add(value.questionId)
    validated.push({ ...value })
  }
  return { rows: rows.filter(row => !seen.has(row.id)), holds: validated }
}

/** Offline review contract only: never a released diagnostic scope or mastery outcome. */
export function prepareSocialPilot(rows: readonly QuestionRow[], holds: unknown = []) {
  const exclusion = excludeSocialPilotHolds(rows, holds)
  const heldHashes = new Set(exclusion.holds.map(hold => hold.contentSha256))
  const ids = new Set<string>()
  const revisions = new Set<string>()
  const buckets = new Map<string, QuestionRow[]>()
  for (const row of rows) {
    if (row.game !== 'sosyal' || row.exam_ref !== 'TYT'
      || !(SOCIAL_PILOT_CATEGORIES as readonly string[]).includes(row.category)) {
      throw new Error('Pilot scope mismatch')
    }
    if (!row.id || !row.published_revision_id || !/^[a-f0-9]{64}$/.test(row.content_sha256 ?? '')) {
      throw new Error('Pinned revision and canonical hash required')
    }
    if (ids.has(row.id) || revisions.has(row.published_revision_id)) throw new Error('Duplicate identity')
    ids.add(row.id)
    revisions.add(row.published_revision_id)
    if (!Number.isInteger(row.difficulty) || row.difficulty! < 1 || row.difficulty! > 5) {
      throw new Error('Invalid difficulty')
    }
    if (!toDraft(row, { strictExamOptionCount: true }).ok) throw new Error(`Invalid question: ${row.id}`)
    // A duplicate question ID must not reintroduce the same held content.
    if (heldHashes.has(row.content_sha256!)) continue
    const band = row.difficulty! <= 2 ? 'easy' : row.difficulty === 3 ? 'medium' : 'hard'
    const key = `${row.category}:${band}`
    buckets.set(key, [...(buckets.get(key) ?? []), row])
  }
  const selected: QuestionRow[] = []
  const coverage = []
  for (const category of SOCIAL_PILOT_CATEGORIES) {
    for (const band of ['easy', 'medium', 'hard']) {
      const pool = (buckets.get(`${category}:${band}`) ?? [])
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      if (pool.length < 2) throw new Error(`Insufficient candidates: ${category}:${band}`)
      selected.push(...pool.slice(0, 2))
      coverage.push({ category, band, count: 2 })
    }
  }
  if (new Set(selected.map(row => row.content_sha256)).size !== selected.length) {
    throw new Error('Duplicate selected content')
  }
  return {
    rows: selected,
    manifest: {
      version: 'social-four-domain-pilot-v1',
      label: 'Sosyal dört alan başlangıç pilotu',
      disclaimer: 'Tam TYT değerlendirmesi değildir; ustalık veya sınav puanı vermez.',
      candidateEvidenceOnly: true,
      publicationAuthorized: false,
      runtimeEnabled: false,
      candidateCount: selected.length,
      proposedQuestionCount: 12,
      proposedMaxPerCategory: 3,
      difficultyBasis: 'author_assigned_not_calibrated',
      coverage,
      holds: exclusion.holds,
      items: selected.map(row => ({ questionId: row.id, revisionId: row.published_revision_id,
        contentSha256: row.content_sha256, category: row.category, difficulty: row.difficulty })),
    },
  }
}

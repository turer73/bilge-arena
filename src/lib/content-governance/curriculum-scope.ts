import type { createServiceRoleClient } from '@/lib/supabase/service-role'

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export interface OutcomeScopeRow {
  id: string
  game: string
  category: string
  exam_ref: string | null
  node_id: string | null
  taxonomy_version: string | null
  is_active: boolean
  code?: string
  title?: string
}

export interface CurriculumPathNode {
  id: string
  code: string
  title: string
  game: string
  category: string | null
  exam_ref: string | null
  parent_id: string | null
  node_type: string
  taxonomy_version: string
  is_active: boolean
}

export interface ValidatedOutcomeScope {
  outcome: OutcomeScopeRow
  path: CurriculumPathNode[]
}

/**
 * Loads the complete outcome -> topic -> unit -> course chain and returns only
 * exact, active scopes. This mirrors migration 164 so selectors do not offer a
 * candidate that PostgreSQL will later reject.
 */
export async function loadValidatedOutcomeScopes(
  admin: ServiceClient,
  outcomes: OutcomeScopeRow[],
): Promise<{ data: Map<string, ValidatedOutcomeScope> | null; error: unknown }> {
  const byId = new Map<string, CurriculumPathNode>()
  let pending = [...new Set(outcomes.flatMap((outcome) => outcome.node_id ? [outcome.node_id] : []))]

  for (let depth = 0; depth < 4 && pending.length > 0; depth += 1) {
    const { data, error } = await admin
      .from('curriculum_nodes')
      .select('id,code,title,game,category,exam_ref,parent_id,node_type,taxonomy_version,is_active')
      .in('id', pending)
    if (error) return { data: null, error }

    const rows = (data ?? []) as CurriculumPathNode[]
    for (const row of rows) byId.set(row.id, row)
    pending = [...new Set(rows.flatMap((row) => row.parent_id && !byId.has(row.parent_id) ? [row.parent_id] : []))]
  }

  const valid = new Map<string, ValidatedOutcomeScope>()
  const expectedTypes = ['outcome', 'topic', 'unit', 'course']

  for (const outcome of outcomes) {
    if (!outcome.is_active || !outcome.node_id || !outcome.taxonomy_version) continue
    const path: CurriculumPathNode[] = []
    let current = byId.get(outcome.node_id)
    let scopeValid = true

    for (let depth = 0; depth < expectedTypes.length; depth += 1) {
      if (
        !current
        || !current.is_active
        || current.node_type !== expectedTypes[depth]
        || current.game !== outcome.game
        || current.exam_ref !== outcome.exam_ref
        || current.taxonomy_version !== outcome.taxonomy_version
        || (depth < 2 && current.category !== outcome.category)
        || (depth < expectedTypes.length - 1 && !current.parent_id)
        || (depth === expectedTypes.length - 1 && current.parent_id !== null)
      ) {
        scopeValid = false
        break
      }
      path.push(current)
      current = current.parent_id ? byId.get(current.parent_id) : undefined
    }

    if (scopeValid && path.length === expectedTypes.length) {
      valid.set(outcome.id, { outcome, path })
    }
  }

  return { data: valid, error: null }
}

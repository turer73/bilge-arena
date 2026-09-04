import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database.client'

type DiagnosticSession =
  Database['public']['Tables']['adaptive_diagnostic_sessions']['Row']
type BlueprintKeys =
  | 'diagnostic_blueprint_version'
  | 'max_per_outcome'
  | 'outcome_count'
  | 'policy_version'
  | 'question_count'
  | 'question_exam_ref'
type HasBlueprintContract =
  Exclude<BlueprintKeys, keyof DiagnosticSession> extends never ? true : false
type SupportsRegistryScopes =
  string extends DiagnosticSession['game'] ? true : false
type KeepsStatusDomain =
  DiagnosticSession['status'] extends 'active' | 'completed' | 'abandoned'
    ? true
    : false

const contract: [
  HasBlueprintContract,
  SupportsRegistryScopes,
  KeepsStatusDomain,
] = [true, true, true]

describe('database client diagnostic session contract', () => {
  it('inherits production blueprint fields without narrowing the global scope', () => {
    expect(contract).toEqual([true, true, true])
  })
})

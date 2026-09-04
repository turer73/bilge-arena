import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../verification/178_180_curriculum_scope_state_equivalence.sql', import.meta.url),
  'utf8'
)
const executableSql = sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''")

describe('legacy curriculum scope state-equivalence attestation', () => {
  it('is rollback-only and contains no schema or data mutation statements', () => {
    expect(sql).toMatch(
      /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/i
    )
    expect(sql).toMatch(/current_setting\('transaction_read_only'\) <> 'on'/i)
    expect(sql).toMatch(/ROLLBACK;\s*$/i)
    expect(executableSql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|NOTIFY|CALL|COPY)\b/i
    )
    expect(executableSql).not.toMatch(/\bCOMMIT\b/i)
  })

  it('requires ledger absence and labels the result as state-equivalent only', () => {
    expect(sql).toContain(
      "'classification', 'ledger-absent, object-and-invariant-consistent'"
    )
    expect(sql).toContain("'178_curriculum_scope_release_registry'")
    expect(sql).toContain("'179_release_tyt_fen_mastery_scope'")
    expect(sql).toContain("'180_backfill_released_tyt_fen_mastery_evidence'")
    expect(sql).toContain('178-180 ledger classification changed')
  })

  it('locks the reviewed migration file identities', () => {
    expect(sql).toContain(
      '1c20619814cff4a563ea895ca90fdea8d71e2e70345f8e0f07d89ca8e9d108d7'
    )
    expect(sql).toContain(
      'e173d1c85217511bde1848ca8c331219c25c549ecbdcfbec194b828470cad060'
    )
    expect(sql).toContain(
      '3ea839b13954680c664c5a6e4eae529521e76bbc724197ff7ad68fd9d5564fb0'
    )
  })

  it('checks RLS, grants, both released scopes and the Fen repair residue', () => {
    expect(sql).toContain('relation.relrowsecurity')
    expect(sql).toContain('has_table_privilege')
    expect(sql).toContain('has_function_privilege')
    expect(sql).toContain('search_path=pg_catalog')
    expect(sql).toContain(
      "curriculum_scope_integrity('matematik', 'TYT', 'ba-tyt-math-v1')"
    )
    expect(sql).toContain(
      "curriculum_scope_integrity('fen', 'TYT', 'ba-tyt-fen-v1')"
    )
    expect(sql).toContain('candidate_evidence_rows = 98')
    expect(sql).toContain('inserted_evidence_rows = 98')
    expect(sql).toContain('v_missing_evidence <> 0')
  })
})

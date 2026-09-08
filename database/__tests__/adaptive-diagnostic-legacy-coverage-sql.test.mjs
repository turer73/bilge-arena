import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL(
  '../migrations/213_adaptive_diagnostic_legacy_coverage_constraint.sql', import.meta.url,
), 'utf8')
const executable = sql.replace(/--[^\n]*/g, '')

describe('213 diagnostic legacy coverage repair contract', () => {
  it('uses a bounded transaction and locks the exact table before catalog checks', () => {
    expect(executable.trim()).toMatch(/^BEGIN;/)
    expect(executable.trim()).toMatch(/COMMIT;$/)
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'")
    expect(sql).toContain("SET LOCAL statement_timeout = '30s'")
    expect(sql).toContain("SET LOCAL idle_in_transaction_session_timeout = '60s'")
    expect(sql).toContain('SET LOCAL search_path = pg_catalog')
    expect(sql.indexOf('LOCK TABLE ONLY public.adaptive_diagnostic_sessions IN ACCESS EXCLUSIVE MODE'))
      .toBeLessThan(sql.indexOf('DO $repair$'))
  })

  it('requires the exact validated dynamic replacement and preserves state, scope and expiry', () => {
    for (const name of ['adaptive_diagnostic_session_dynamic_counter_check',
      'adaptive_diagnostic_session_state_check', 'adaptive_diagnostic_session_scope_snapshot_check',
      'adaptive_diagnostic_sessions_check1']) expect(sql).toContain(name)
    expect(sql).toContain('NOT v_constraint.convalidated')
    expect(sql).toContain('NOT v_constraint.conislocal')
    expect(sql).toContain('v_constraint.coninhcount<>0')
    expect(sql).toContain('v_constraint.connoinherit')
    expect(sql).toContain('pg_get_expr(v_constraint.conbin,v_table)')
    expect(sql).toContain('required constraint missing')
    expect(sql).toContain('required constraint drift')
    expect(sql).toContain('covered_outcomes <= outcome_count')
    expect(sql).toContain('covered_outcomes <= answered_count')
    expect(sql).toContain("AND attnotnull AND NOT attisdropped AND atttypid='smallint'::regtype)<>5")
  })

  it('only drops the measured legacy name after its exact expression gate', () => {
    const drops = executable.match(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+(\w+)/g)
    expect(drops).toEqual(['DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_check'])
    expect(sql).toContain("IS DISTINCT FROM '(((covered_outcomes>=0)AND(covered_outcomes<=6))AND(covered_outcomes<=answered_count))'")
    expect(sql.indexOf("MESSAGE='diagnostic coverage repair: legacy constraint drift'"))
      .toBeLessThan(sql.indexOf('DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_check'))
    expect(executable).not.toMatch(/\bCASCADE\b|\bDROP\s+(TABLE|FUNCTION|TRIGGER|POLICY)\b/i)
    expect(sql).toContain('legacy constraint remains')
  })

  it('compares all protected catalog state without rewriting learner data or permissions', () => {
    for (const subject of ['constraints', 'triggers', 'security']) {
      expect(sql).toContain(`IS DISTINCT FROM v_before_${subject}`)
    }
    for (const token of ['pg_inherits', 'pg_trigger', 'pg_policy', 'pg_attribute',
      'relowner', 'relacl', 'relrowsecurity', 'relforcerowsecurity']) expect(sql).toContain(token)
    expect(executable).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE\b|GRANT\b|REVOKE\b|DISABLE\s+TRIGGER|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION)/i)
    expect(executable).not.toMatch(/EXCEPTION\s+WHEN\s+(?:OTHERS|check_violation)/i)
  })

  it('ships an independent read-only postcheck without learner or ledger mutations', () => {
    const postcheck = readFileSync(new URL(
      '../../scripts/security/verify-adaptive-diagnostic-coverage.sql', import.meta.url,
    ), 'utf8').replace(/--[^\n]*/g, '')
    expect(postcheck.trim()).toMatch(/^BEGIN READ ONLY;/)
    expect(postcheck.trim()).toMatch(/ROLLBACK;$/)
    expect(postcheck).toContain("current_setting('transaction_read_only')")
    expect(postcheck).toContain("'passed'::text AS diagnostic_coverage_postcheck")
    expect(postcheck).toContain('convalidated AND conislocal')
    expect(postcheck).toContain('pg_get_expr(conbin,conrelid)')
    expect(postcheck).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|COMMIT)\b/i)
  })

  it('rejects unknown coverage constraints and exact trigger-metadata drift', () => {
    expect(sql).toContain("attname='covered_outcomes' AND NOT attisdropped)=ANY(conkey)")
    expect(sql).toContain('renamed legacy constraint drift')
    for (const fragment of ['tgtype=v_expected.event_type',
      'tgfoid=to_regprocedure(v_expected.function_name)', 'tgnargs=0',
      "tgargs=''::bytea", 'tgqual IS NULL', 'NOT tgdeferrable',
      'NOT tginitdeferred', 'tgattr::text=CASE']) expect(sql).toContain(fragment)
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/156_account_export_report_privacy.sql', import.meta.url),
  'utf8',
)

describe('account export report privacy SQL', () => {
  it('excludes user_reports from generic subject-row export', () => {
    expect(sql).toContain("relation.relname <> 'user_reports'")
    expect(sql).not.toMatch(/attribute\.attname = ANY[\s\S]*?'reported_user_id'/)
  })

  it('exports only reporter-owned fields through an explicit projection', () => {
    expect(sql).toContain('WHERE report_row.reporter_id = $1')
    expect(sql).toContain("''reportedUserId'', report_row.reported_user_id")
    expect(sql).not.toContain("''adminNote''")
    expect(sql).not.toContain("''resolvedBy''")
  })

  it('keeps the RPC service-role-only with a fixed search path', () => {
    expect(sql).toContain('SET search_path = pg_catalog')
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;',
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '128_error_report_rewards.sql'),
  'utf8',
)

describe('128 error report reward SQL contract', () => {
  it('keeps the reward trace on the report itself', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS rewarded_at timestamptz/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS rewarded_coins integer/)
  })

  it('rewards only a resolved report', () => {
    expect(sql).toContain("v_report.status <> 'resolved'")
    expect(sql).toContain('report is not resolved')
  })

  it('cannot reward the same report twice', () => {
    expect(sql).toContain('v_report.rewarded_at IS NOT NULL')
    expect(sql).toContain("'replayed', true")
  })

  it('refuses anonymous reporters and self-rewarding admins', () => {
    expect(sql).toContain('v_report.user_id IS NULL OR v_report.user_id = p_admin_id')
  })

  it('requires the report permission and bounds the amount', () => {
    expect(sql).toContain("has_permission(p_admin_id, 'admin.reports.manage')")
    expect(sql).toMatch(/c_max_coins constant integer := 300/)
    expect(sql).toContain('p_coins <= 0 OR p_coins > c_max_coins')
  })

  it('locks the report row so concurrent calls cannot double-pay', () => {
    expect(sql).toContain('FOR UPDATE')
  })

  it('is service-role only with a fixed search path', () => {
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = pg_catalog/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})

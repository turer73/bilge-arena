import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/162_admin_write_rls_initplan.sql', import.meta.url),
  'utf8',
)

describe('migration 162 admin write RLS initplan closure', () => {
  it('wraps all 21 policy expressions in a statement-scoped SELECT', () => {
    const wrapped = sql.match(
      /\(SELECT public\.has_admin_write_access\('[^']+'\)\)/g,
    )

    expect(wrapped).toHaveLength(21)
    expect(sql).not.toMatch(
      /(?:USING|WITH CHECK)\s*\(\s*public\.has_admin_write_access\(/,
    )
  })

  it('keeps the forward migration self-verifying', () => {
    expect(sql).toContain('v_policy_count <> 20')
    expect(sql).toContain('v_unwrapped_count <> 0')
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
})

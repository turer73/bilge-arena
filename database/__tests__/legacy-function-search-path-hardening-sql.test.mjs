import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/153_legacy_function_search_path_hardening.sql', import.meta.url),
  'utf8',
)

describe('legacy function search-path hardening SQL', () => {
  it.each([
    'public.update_updated_at()',
    'public.check_premium_status()',
    'public.generate_referral_code()',
    'public.immutable_unaccent(text)',
    'public.update_homepage_updated_at()',
  ])('pins %s behind pg_catalog', (signature) => {
    expect(sql).toContain(`ALTER FUNCTION ${signature}`)
  })

  it('uses one fixed search path for every legacy function', () => {
    expect(sql.match(/SET search_path = pg_catalog, public;/g)).toHaveLength(5)
  })
})

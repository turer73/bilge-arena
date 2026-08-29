import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const prepareSql = readFileSync(
  new URL('../migrations/173_public_definer_rpc_boundary.sql', import.meta.url),
  'utf8',
)
const cutoverSql = readFileSync(
  new URL('../migrations/174_public_definer_rpc_cutover.sql', import.meta.url),
  'utf8',
)

describe('public definer RPC boundary SQL', () => {
  it('prepares service access before revoking the legacy callers', () => {
    expect(prepareSql).toContain('GRANT EXECUTE ON FUNCTION public.get_public_profile(text)')
    expect(prepareSql).toContain('GRANT EXECUTE ON FUNCTION public.search_questions')
    expect(prepareSql).not.toContain('FROM PUBLIC, anon, authenticated, service_role')
  })

  it('pins the public profile function search path', () => {
    expect(prepareSql).toContain('ALTER FUNCTION public.get_public_profile(text)')
    expect(prepareSql).toContain('SET search_path = pg_catalog, public;')
  })

  it('removes anonymous direct execution only in the post-deploy cutover', () => {
    expect(cutoverSql.match(/FROM PUBLIC, anon, authenticated, service_role;/g)).toHaveLength(2)
    expect(cutoverSql).toContain('TO service_role;')
    expect(cutoverSql).toContain('TO authenticated, service_role;')
    expect(cutoverSql).toContain('174 verification: get_public_profile grants invalid')
    expect(cutoverSql).toContain('174 verification: search_questions grants invalid')
  })
})

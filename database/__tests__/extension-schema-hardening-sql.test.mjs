import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/175_extension_schema_hardening.sql', import.meta.url),
  'utf8',
)

describe('extension schema hardening SQL', () => {
  it('moves only the two verified relocatable extensions', () => {
    expect(sql).toContain("ARRAY['pg_trgm','unaccent']")
    expect(sql).toContain("ALTER EXTENSION %I SET SCHEMA extensions")
    expect(sql).toContain('IF NOT v_relocatable')
  })

  it('rebinds immutable_unaccent to the private extension schema', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)')
    expect(sql).toContain("extensions.unaccent('extensions.unaccent', $1)")
    expect(sql).toContain('SET search_path = pg_catalog, extensions')
  })

  it('verifies behavior and all dependent trigram indexes', () => {
    expect(sql).toContain("public.immutable_unaccent('ÇÖZÜM') <> 'COZUM'")
    expect(sql).toContain('AND NOT i.indisvalid')
    expect(sql).toContain('175 verification: % trigram indexes invalid')
  })
})

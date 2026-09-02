import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../scripts/security/export-tyt-social-governance-manifest.mjs', import.meta.url),
  'utf8',
)

describe('TYT Social governance manifest safety', () => {
  it('has no apply mode and requires an explicit read-only acknowledgement', () => {
    expect(source).toContain('process.argv.length !== 2')
    expect(source).toContain("TYT_SOCIAL_AUDIT_DATABASE_READ_ONLY === '1'")
    expect(source).not.toMatch(/--apply|--write|--commit/i)
  })

  it('runs in a repeatable read-only transaction and always rolls back', () => {
    expect(source).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(source).toContain('SHOW transaction_read_only')
    expect(source).toContain("transaction_read_only !== 'on'")
    expect(source.match(/client\.query\('ROLLBACK'\)/g)).toHaveLength(2)
  })

  it('selects governance metadata without question or answer content', () => {
    expect(source).toContain('revision.content_sha256')
    expect(source).toContain("extensions.digest(source.provenance_ref, 'sha256')")
    expect(source).toContain('revision.prepared_by IS NOT NULL')
    expect(source).toContain('revision.game IS NOT DISTINCT FROM question.game::text')
    expect(source).toContain('revision.category IS NOT DISTINCT FROM question.category::text')
    expect(source).toContain("revision.content_sha256 ~ '^[0-9a-f]{64}$'")
    expect(source).not.toMatch(/question\.content|revision\.content(?!_sha256)|correct_option|answer_key/i)
    expect(source).not.toMatch(/prepared_by\s+AS|reviewer_id\s+AS/i)
  })

  it('fails closed unless exactly one current candidate policy is projected', () => {
    expect(source).toContain('count(*)::integer AS policy_count')
    expect(source).toContain('policy_count !== 1')
    expect(source).toContain('manifest policy projection drifted')
  })

  it('contains no persistent database write statement', () => {
    const sql = source.slice(source.indexOf('const policySql'), source.indexOf('function allowedRoles'))
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL)\b/i)
  })

  it('does not emit raw provenance or candidate rationale', () => {
    expect(source).toContain('provenanceSha256: row.provenance_sha256')
    expect(source).not.toMatch(/provenanceRef:|rationale:/)
  })
})

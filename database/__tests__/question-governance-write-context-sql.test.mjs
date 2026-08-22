import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '142_question_governance_write_context.sql'),
  'utf8',
)

describe('142 unforgeable governed question write context', () => {
  it('requires a private backend, transaction and question-bound context', () => {
    expect(sql).toMatch(/PRIMARY KEY\(backend_pid,transaction_id,question_id\)/)
    expect(sql).toMatch(/context\.backend_pid=pg_backend_pid\(\)/)
    expect(sql).toMatch(/context\.transaction_id=txid_current\(\)/)
    expect(sql).toMatch(/context\.question_id=NEW\.id/)
  })

  it('does not accept the caller-settable GUC as authorization', () => {
    expect(sql).not.toContain("current_setting('app.content_governance_publish'")
    expect(sql).not.toContain("set_config('app.content_governance_publish'")
  })

  it('keeps the context table and helper functions private', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.content_governance_write_context[\s\S]+service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.content_governance_authorize_question_write[\s\S]+service_role/)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.content_governance_authorize_question_write/)
  })

  it('opens and clears the context only around each governed questions write', () => {
    for (const operation of ['create', 'publish', 'quarantine']) {
      expect(sql).toContain(`'${operation}'`)
    }
    expect(sql.match(/content_governance_authorize_question_write/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql.match(/content_governance_clear_question_write/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

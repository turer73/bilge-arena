import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/165_question_search_admin_aal2.sql', import.meta.url),
  'utf8',
)

describe('migration 165 search_questions admin AAL2 contract', () => {
  it('keeps public search but binds raw admin content to a signed AAL2 claim', () => {
    expect(sql).toMatch(/IF admin_view = TRUE[\s\S]*auth\.jwt\(\) ->> 'aal'[\s\S]*<> 'aal2'/)
    expect(sql).toContain("rp.permission = 'admin.dashboard.view'")
    expect(sql).toContain("RAISE EXCEPTION 'admin_view requires aal2 admin privileges'")
    expect(sql).toMatch(/CASE WHEN admin_view = TRUE THEN q\.content[\s\S]*ELSE q\.content - 'answer' - 'correct' - 'solution' - 'explanation' - 'hint'/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.search_questions[\s\S]*TO anon,authenticated/)
    expect(sql).toContain("has_function_privilege('service_role','public.search_questions")
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
})

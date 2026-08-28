import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/184_adaptive_diagnostic_registry_write_gate.sql', import.meta.url),
  'utf8',
)

describe('adaptive diagnostic release-registry write gate migration', () => {
  it('locks and requires the exact supported diagnostic capability', () => {
    expect(sql).toContain("scope.game = 'matematik'")
    expect(sql).toContain("scope.display_exam_ref = 'TYT'")
    expect(sql).toContain("scope.question_exam_ref = 'TYT'")
    expect(sql).toContain("scope.taxonomy_version = 'ba-tyt-math-v1'")
    expect(sql).toContain("scope.release_status = 'released'")
    expect(sql).toContain('scope.diagnostic_enabled')
    expect(sql).toContain('FOR SHARE')
    expect(sql).toContain("USING ERRCODE = '22023'")
  })

  it('gates only new sessions and new evidence rows', () => {
    expect(sql).toMatch(/BEFORE INSERT ON public\.adaptive_diagnostic_sessions/)
    expect(sql).toMatch(/BEFORE INSERT ON public\.adaptive_diagnostic_answers/)
    expect(sql).not.toMatch(/BEFORE (?:UPDATE|DELETE)/)
  })

  it('keeps the trigger function private', () => {
    expect(sql).toMatch(/SECURITY DEFINER[\s\S]+SET search_path = pg_catalog/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.tg_require_adaptive_diagnostic_release\(\)[\s\S]+service_role/)
  })
})

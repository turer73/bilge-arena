import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const registrySql = readFileSync(join(root, '178_curriculum_scope_release_registry.sql'), 'utf8')
const fenReleaseSql = readFileSync(join(root, '179_release_tyt_fen_mastery_scope.sql'), 'utf8')

describe('178-179 curriculum scope release migrations', () => {
  it('keeps the release registry private and resolves only released scopes', () => {
    expect(registrySql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_releases/)
    expect(registrySql).toMatch(/release_status IN \('draft','validating','released','retired'\)/)
    expect(registrySql).toMatch(/ALTER TABLE public\.curriculum_scope_releases ENABLE ROW LEVEL SECURITY/)
    expect(registrySql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_releases FROM PUBLIC, anon, authenticated, service_role/)
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_released_curriculum_scope[\s\S]*release_status = 'released'/)
    expect(registrySql).toMatch(/SET search_path = pg_catalog/)
    expect(registrySql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_released_curriculum_scope\(text,text\),[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(registrySql).toMatch(/GRANT EXECUTE ON FUNCTION public\.resolve_released_curriculum_scope\(text,text\),[\s\S]*TO service_role/)
  })

  it('registers draft scopes without downgrading an already released scope', () => {
    expect(registrySql).toMatch(/VALUES\s*\(\s*'matematik', 'TYT', 'TYT', 'ba-tyt-math-v1',/)
    expect(registrySql).toContain("('fen', 'TYT', 'TYT', 'ba-tyt-fen-v1', 'draft'")
    expect(registrySql).toContain("('turkce', 'TYT', 'TYT', 'ba-tyt-turkce-v1', 'draft'")
    expect(registrySql).toContain("('sosyal', 'TYT', 'TYT', 'ba-tyt-sosyal-v1', 'draft'")
    expect(registrySql).toContain("('wordquest', 'YDT', NULL, 'ba-ydt-eng-v1', 'draft'")
    const draftUpsert = registrySql.slice(registrySql.indexOf('-- Graphs exist for these scopes'))
    expect(draftUpsert).not.toMatch(/ON CONFLICT[\s\S]{0,500}release_status\s*=\s*EXCLUDED\.release_status/)
  })

  it('uses a generic, fail-closed integrity contract', () => {
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.curriculum_scope_integrity\([\s\S]*p_game text,[\s\S]*p_display_exam_ref text,[\s\S]*p_taxonomy_version text/)
    for (const field of [
      'total', 'mapped', 'unmapped', 'scopeMismatch', 'nodeOrphan',
      'outcomeOrphan', 'primaryMismatch', 'emptyOutcome',
    ]) expect(registrySql).toContain(`'${field}'`)
    expect(registrySql).toMatch(/HAVING count\(\*\) FILTER \(WHERE mapping\.is_primary\) <> 1/)
    expect(registrySql).toMatch(/NOT EXISTS \([\s\S]*FROM valid_mapping_rows AS mapping[\s\S]*mapping\.outcome_id = outcome\.id/)
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.curriculum_graph_integrity\(\)[\s\S]*curriculum_scope_integrity\('matematik', 'TYT', 'ba-tyt-math-v1'\)/)
    expect(registrySql).toMatch(/TYT Mathematics curriculum scope failed registry integrity/)
    expect(registrySql).toMatch(/curriculum_scope_integrity\('matematik', 'TYT', 'ba-tyt-math-v1'\)[\s\S]*v_integrity->>'primaryMismatch'[\s\S]*v_integrity->>'emptyOutcome'/)
    expect(registrySql).toMatch(/REVOKE ALL ON FUNCTION public\.curriculum_graph_integrity\(\) FROM PUBLIC, anon, authenticated/)
  })

  it('maps only validating or released scopes and preserves manual ownership', () => {
    expect(registrySql).toContain('min(outcome.id::text)::uuid')
    expect(registrySql).not.toContain('min(outcome.id),')
    expect(registrySql).toMatch(/DELETE FROM public\.question_outcomes[\s\S]*mapping_source = 'taxonomy_auto'/)
    expect(registrySql).toMatch(/release_status IN \('validating', 'released'\)/)
    expect(registrySql).toMatch(/NOT EXISTS \([\s\S]*existing\.question_id = p_question_id AND existing\.is_primary/)
    expect(registrySql).toMatch(/ON CONFLICT \(question_id, outcome_id\) DO NOTHING/)
    expect(registrySql).toMatch(/REVOKE ALL ON FUNCTION public\.sync_taxonomy_auto_question_outcomes\(uuid,text,text,text,boolean\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
  })

  it('releases TYT Fen only after every integrity field is clean', () => {
    expect(fenReleaseSql).toMatch(/release_status = CASE WHEN release_status = 'released' THEN 'released' ELSE 'validating' END/)
    expect(fenReleaseSql).toMatch(/WHERE game = 'fen'[\s\S]*display_exam_ref = 'TYT'[\s\S]*taxonomy_version = 'ba-tyt-fen-v1'/)
    expect(fenReleaseSql).toMatch(/FOR v_question IN[\s\S]*FROM public\.questions[\s\S]*WHERE game = 'fen'[\s\S]*is_active/)
    expect(fenReleaseSql).toMatch(/curriculum_scope_integrity\('fen', 'TYT', 'ba-tyt-fen-v1'\)/)
    for (const field of [
      'unmapped', 'scopeMismatch', 'nodeOrphan', 'outcomeOrphan',
      'primaryMismatch', 'emptyOutcome',
    ]) expect(fenReleaseSql).toMatch(new RegExp(`v_integrity->>'${field}'`))
    expect(fenReleaseSql).toMatch(/COALESCE\(\(v_integrity->>'total'\)::integer, 0\) <= 0/)
    expect(fenReleaseSql).toMatch(/SET release_status = 'released'[\s\S]*resolve_released_curriculum_scope\('fen', 'TYT'\)/)
  })
})

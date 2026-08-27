import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const registrySql = readFileSync(join(root, '178_curriculum_scope_release_registry.sql'), 'utf8')
const fenReleaseSql = readFileSync(join(root, '179_release_tyt_fen_mastery_scope.sql'), 'utf8')
const fenRepairSql = readFileSync(join(root, '180_backfill_released_tyt_fen_mastery_evidence.sql'), 'utf8')
const completeRepairSql = readFileSync(join(root, '181_curriculum_scope_repair_and_parent_integrity.sql'), 'utf8')

describe('178-181 curriculum scope release migrations', () => {
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
    expect(registrySql).toMatch(/'matematik', 'TYT', 'TYT', 'ba-tyt-math-v1',[\s\S]*ON CONFLICT \(game, display_exam_ref\) DO NOTHING/)
    const draftUpsert = registrySql.slice(registrySql.indexOf('-- Graphs exist for these scopes'))
    expect(draftUpsert).not.toMatch(/ON CONFLICT[\s\S]{0,500}release_status\s*=\s*EXCLUDED\.release_status/)
    expect(draftUpsert).toMatch(/WHERE public\.curriculum_scope_releases\.release_status IN \('draft', 'validating'\)/)
    expect(draftUpsert).toMatch(/curriculum_scope_releases\.taxonomy_version = EXCLUDED\.taxonomy_version/)
  })

  it('uses a generic, fail-closed integrity contract', () => {
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.curriculum_scope_integrity\([\s\S]*p_game text,[\s\S]*p_display_exam_ref text,[\s\S]*p_taxonomy_version text/)
    for (const field of [
      'total', 'mapped', 'unmapped', 'scopeMismatch', 'nodeOrphan',
      'outcomeOrphan', 'primaryMismatch', 'emptyOutcome',
    ]) expect(registrySql).toContain(`'${field}'`)
    expect(registrySql).toMatch(/HAVING count\(\*\) FILTER \(WHERE mapping\.is_primary\) <> 1/)
    expect(registrySql).toMatch(/NOT EXISTS \([\s\S]*FROM valid_mapping_rows AS mapping[\s\S]*mapping\.outcome_id = outcome\.id/)
    expect(registrySql).toMatch(/child\.node_type = 'outcome'[\s\S]*parent\.category IS DISTINCT FROM child\.category/)
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.curriculum_graph_integrity\(\)[\s\S]*curriculum_scope_integrity\('matematik', 'TYT', 'ba-tyt-math-v1'\)/)
    expect(registrySql).toMatch(/TYT Mathematics curriculum scope failed registry integrity/)
    expect(registrySql).toMatch(/taxonomy_version = 'ba-tyt-math-v1'[\s\S]*release_status = 'released'[\s\S]*curriculum_scope_integrity\('matematik', 'TYT', 'ba-tyt-math-v1'\)[\s\S]*v_integrity->>'primaryMismatch'[\s\S]*v_integrity->>'emptyOutcome'/)
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

  it('repairs only missing historical verified Fen evidence with a private replay ledger', () => {
    expect(fenRepairSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_evidence_repairs/)
    expect(fenRepairSql).toMatch(/ALTER TABLE public\.curriculum_scope_evidence_repairs ENABLE ROW LEVEL SECURITY/)
    expect(fenRepairSql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_evidence_repairs[\s\S]*PUBLIC, anon, authenticated, service_role/)
    expect(fenRepairSql).toMatch(/release_status = 'released'[\s\S]*curriculum_scope_integrity\('fen', 'TYT', 'ba-tyt-fen-v1'\)/)
    expect(fenRepairSql).toMatch(/attempt\.game = 'fen'/)
    expect(fenRepairSql).toMatch(/mapping\.mapping_source = 'taxonomy_auto'/)
    expect(fenRepairSql).toMatch(/mapping\.created_at > answer\.answered_at/)
    expect(fenRepairSql).toMatch(/LEFT JOIN public\.mastery_outcome_evidence AS existing[\s\S]*existing\.answer_id IS NULL/)
    expect(fenRepairSql).toMatch(/ON CONFLICT \(answer_id, outcome_id\) DO NOTHING/)
    expect(fenRepairSql).toMatch(/ON CONFLICT \(user_id, outcome_id\) DO UPDATE SET/)
    expect(fenRepairSql).toMatch(/v_candidates <> v_inserted[\s\S]*TYT Fen evidence repair lost rows/)
  })

  it('repairs all missing primary Fen evidence and hardens parent-category integrity', () => {
    expect(completeRepairSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_evidence_repair_runs/)
    expect(completeRepairSql).toMatch(/ALTER TABLE public\.curriculum_scope_evidence_repair_runs ENABLE ROW LEVEL SECURITY/)
    expect(completeRepairSql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_evidence_repair_runs[\s\S]*PUBLIC, anon, authenticated, service_role/)
    expect(completeRepairSql).toMatch(/JOIN public\.mastery_materialized_attempts AS marker ON marker\.attempt_id = attempt\.id/)
    expect(completeRepairSql).toMatch(/JOIN public\.question_outcomes AS mapping[\s\S]*mapping\.is_primary/)
    expect(completeRepairSql).not.toMatch(/mapping\.mapping_source\s*=\s*'taxonomy_auto'/)
    expect(completeRepairSql).not.toMatch(/mapping\.created_at\s*>\s*answer\.answered_at\s*\n\s*AND existing\.answer_id IS NULL/)
    expect(completeRepairSql).toMatch(/manual_mapping_rows[\s\S]*mapping_at_or_before_answer_rows[\s\S]*mapping_after_answer_rows/)
    expect(completeRepairSql).toMatch(/BEFORE INSERT OR UPDATE OF node_type, parent_id, game, exam_ref, taxonomy_version, category/)
    expect(completeRepairSql).toMatch(/NEW\.node_type = 'outcome'[\s\S]*v_parent\.category IS DISTINCT FROM NEW\.category/)
    expect(completeRepairSql).toMatch(/child\.node_type = 'outcome'[\s\S]*parent\.category IS DISTINCT FROM child\.category/)
    expect(completeRepairSql).toMatch(/v_node\.category IS DISTINCT FROM NEW\.category/)
    expect(completeRepairSql).toMatch(/v_candidates <> v_inserted[\s\S]*TYT Fen complete evidence repair lost rows/)
  })
})

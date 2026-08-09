import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '096_curriculum_graph_v1.sql'), 'utf8')

describe('096 curriculum graph v1 migration', () => {
  it('defines a private, strictly layered internal curriculum graph', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_nodes/)
    expect(sql).toMatch(/node_type IN \('course','unit','topic','outcome'\)/)
    expect(sql).toMatch(/parent_id uuid REFERENCES public\.curriculum_nodes\(id\) ON DELETE RESTRICT/)
    expect(sql).toMatch(/ALTER TABLE public\.curriculum_nodes ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_nodes, public\.curriculum_outcomes, public\.question_outcomes[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*REVOKE ALL ON TABLE public\.curriculum_nodes, public\.curriculum_outcomes, public\.question_outcomes FROM service_role/)
    expect(sql).toMatch(/curriculum node parent must be the preceding level in the same scope/)
    expect(sql).toMatch(/curriculum node update would invalidate an existing child scope/)
    expect(sql).toMatch(/curriculum node update would invalidate an existing outcome/)
    expect(sql).toMatch(/WHEN 'unit' THEN 'course'[\s\S]*WHEN 'topic' THEN 'unit'[\s\S]*WHEN 'outcome' THEN 'topic'/)
    expect(sql).toMatch(/SET search_path = pg_catalog/)
  })

  it('binds outcomes to graph leaves and preserves manual mappings from auto rebuilds', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS node_id uuid/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS taxonomy_version text/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS mapping_source text NOT NULL DEFAULT 'manual'/)
    expect(sql).toMatch(/mapping_source IN \('manual','taxonomy_auto'\)/)
    expect(sql).toMatch(/curriculum outcome must reference an outcome leaf in the same scope/)
    expect(sql).toMatch(/DELETE FROM public\.question_outcomes[\s\S]*mapping_source='taxonomy_auto'/)
    expect(sql).toMatch(/ON CONFLICT \(question_id,outcome_id\) DO NOTHING/)
    expect(sql).toMatch(/MAT-SAY-01[\s\S]*ba-tyt-math-v1/)
  })

  it('seeds every pilot category, fail-closes unsupported active categories, and checks the invariant', () => {
    for (const category of ['sayilar','denklemler','fonksiyonlar','problemler','geometri','olasilik']) {
      expect(sql).toContain(`'${category}'`)
    }
    expect(sql).toMatch(/unsupported active TYT mathematics category[\s\S]*22023/)
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OF game, exam_ref, category, is_active ON public\.questions/)
    expect(sql).toMatch(/FOR v_question IN[\s\S]*upper\(COALESCE\(exam_ref,''\)\)='TYT'[\s\S]*sync_taxonomy_auto_question_outcomes/)
    expect(sql).toMatch(/TYT mathematics taxonomy seed left unmapped active questions/)
    expect(sql).toMatch(/outcome\.taxonomy_version='ba-tyt-math-v1'[\s\S]*outcome\.category IS NOT DISTINCT FROM/)
    expect(sql).toMatch(/scope_mismatch[\s\S]*outcome\.taxonomy_version IS DISTINCT FROM 'ba-tyt-math-v1'[\s\S]*outcome\.category IS DISTINCT FROM/)
  })

  it('exposes only count-only service-role integrity telemetry', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.curriculum_graph_integrity\(\)[\s\S]*RETURNS jsonb/)
    for (const field of ['total','mapped','unmapped','scopeMismatch','nodeOrphan','outcomeOrphan']) {
      expect(sql).toContain(`'${field}'`)
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.curriculum_graph_integrity\(\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.curriculum_graph_integrity\(\) TO service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.curriculum_node_parent_guard\(\),[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
  })
})

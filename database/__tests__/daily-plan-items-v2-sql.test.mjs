import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '095_daily_plan_items_v2.sql'), 'utf8')

describe('095 daily plan items V2 migration', () => {
  it('defines private ordered item snapshots with closed metadata catalogs', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.daily_plan_items/)
    expect(sql).toMatch(/PRIMARY KEY \(plan_id, position\)/)
    expect(sql).toMatch(/UNIQUE \(plan_id, question_id\)/)
    expect(sql).toMatch(/position BETWEEN 1 AND 15/)
    expect(sql).toMatch(/ON DELETE CASCADE/)
    expect(sql).toMatch(/question_id uuid NOT NULL REFERENCES public\.questions\(id\) ON DELETE RESTRICT/)
    expect(sql).toMatch(/slot_type IN \('due','weak_outcome','current_target','challenge','student_choice'\)/)
    expect(sql).toMatch(/source_type IN \('due','weak_outcome','current_target','challenge','student_choice','fresh','legacy'\)/)
    expect(sql).toMatch(/source_ref IS NULL OR char_length\(source_ref\) BETWEEN 1 AND 200/)
  })

  it('keeps the item table private and exposes only service-role RPCs', () => {
    expect(sql).toMatch(/ALTER TABLE public\.daily_plan_items ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.daily_plan_items FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.daily_plan_items FROM service_role/)
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.daily_plan_items TO service_role/)
    expect(sql).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_daily_plan_v2[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_daily_plan_v2[\s\S]*TO service_role/)
  })

  it('validates canonical arrays, source metadata, question scope, and replay races before writing', () => {
    expect(sql).toMatch(/jsonb_typeof\(p_items\) <> 'array'[\s\S]*jsonb_array_length\(p_items\) NOT BETWEEN 1 AND 15/)
    expect(sql).toMatch(/positions and question ids must be unique and contiguous[\s\S]*22023/)
    expect(sql).toMatch(/q\.game=p_game AND q\.exam_ref IS NOT DISTINCT FROM p_exam_ref/)
    expect(sql).toMatch(/EXCEPTION WHEN unique_violation THEN[\s\S]*FOR UPDATE[\s\S]*RETURN v_payload/)
    expect(sql).toMatch(/INSERT INTO public\.daily_plan_items\(plan_id,position,question_id,slot_type,source_type,source_ref\)/)
    expect(sql).toMatch(/array_agg\(\(e\.item->>'question_id'\)::uuid ORDER BY \(e\.item->>'position'\)::smallint\)/)
  })

  it('completes only owned V2 members idempotently and atomically unions legacy members', () => {
    expect(sql).toMatch(/daily plan owner mismatch[\s\S]*42501/)
    expect(sql).toMatch(/SET completed_at=COALESCE\(completed_at,clock_timestamp\(\)\)/)
    expect(sql).toMatch(/question_id=ANY\(COALESCE\(p_question_ids,'\{\}'::uuid\[\]\)\)/)
    expect(sql).toMatch(/array_agg\(question_id ORDER BY position\) FILTER \(WHERE completed_at IS NOT NULL\)/)
    expect(sql).toMatch(/Legacy plans deliberately have no V2 items[\s\S]*UPDATE public\.daily_plan dp[\s\S]*unnest\(dp\.question_ids\) WITH ORDINALITY[\s\S]*q\.question_id=ANY\(COALESCE\(dp\.completed_ids,'\{\}'::uuid\[\]\)\)[\s\S]*q\.question_id=ANY\(COALESCE\(p_question_ids,'\{\}'::uuid\[\]\)\)/)
    expect(sql).toMatch(/array_agg\(q\.question_id ORDER BY q\.position\)/)
  })
})

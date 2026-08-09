import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '094_persistent_fsrs.sql'), 'utf8')

describe('094 persistent FSRS migration', () => {
  it('defines card/log identity, binary ratings and append-only client ACLs', () => {
    expect(sql).toMatch(/PRIMARY KEY \(user_id, question_id\)/)
    expect(sql).toMatch(/answer_id uuid NOT NULL UNIQUE REFERENCES public\.session_answers/)
    expect(sql).toMatch(/rating smallint NOT NULL CHECK \(rating IN \(1, 3\)\)/)
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.review_cards, public\.review_logs/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/g)
  })

  it('uses a private FSRS-6 transition with UTC elapsed days and 1/10 minute steps', () => {
    expect(sql).toMatch(/ts-fsrs@5\.4\.1/)
    expect(sql).toMatch(/FSRS-6 defaults, enable_fuzz=false, Again=1 and Good=3/)
    expect(sql).toMatch(/AT TIME ZONE 'UTC'/)
    expect(sql).toMatch(/v_factor numeric := 0\.98034649/)
    expect(sql).toMatch(/v_s \/ exp\(w\[18\] \* w\[19\]\)/)
    expect(sql).toMatch(/IF p_rating >= 2 THEN v_sinc := GREATEST\(v_sinc, 1\); END IF/)
    expect(sql).toMatch(/v_s_after_fail := round\(\s*LEAST\(\s*36500::numeric,\s*GREATEST\(\s*0\.001::numeric,[\s\S]*exp\(\(1-v_r\)\*w\[15\]\)\s*\)\s*\),\s*8\s*\);/)
    expect(sql).toMatch(/v_next_s_min := round\(v_s \/ exp\(w\[18\] \* w\[19\]\), 8\)/)
    expect(sql).toMatch(/v_s := LEAST\(GREATEST\(0\.001::numeric, v_next_s_min\), v_s_after_fail\)/)
    expect(sql).toMatch(/interval '1 minute'/)
    expect(sql).toMatch(/interval '10 minutes'/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fsrs_review_transition[\s\S]*service_role/)
  })

  it('attaches only non-skip answers, deduplicates source answers, and rebuilds out of order history', () => {
    expect(sql).toMatch(/AFTER INSERT ON public\.session_answers/)
    expect(sql).toMatch(/WHEN \(COALESCE\(NEW\.is_skipped,false\) IS NOT TRUE\)/)
    expect(sql).toMatch(/ON CONFLICT\(answer_id\) DO NOTHING/)
    expect(sql).toMatch(/a\.answered_at,\(CASE WHEN a\.is_correct THEN 3 ELSE 1 END\)::smallint\)/)
    expect(sql).toMatch(/\(a\.answered_at, a\.id\) < \(c\.last_review_at, COALESCE\(c\.last_answer_id/)
    expect(sql).toMatch(/PERFORM public\.rebuild_review_card\(a\.user_id,a\.question_id\)/)
  })

  it('bounds cursor backfill and limits operational RPCs to service role', () => {
    expect(sql).toMatch(/p_batch_size NOT BETWEEN 1 AND 1000/)
    expect(sql).toMatch(/ORDER BY sa\.answered_at,sa\.id LIMIT p_batch_size/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.backfill_review_cards[\s\S]*TO service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.backfill_review_cards[\s\S]*public\.set_review_error_reason[\s\S]*TO service_role/)
    expect(sql).toMatch(/set_review_error_reason\(p_user_id uuid,p_review_log_id uuid,p_reason_code text\)/)
    expect(sql).toMatch(/review log owner mismatch[\s\S]*42501/)
    expect(sql).toMatch(/error reason requires an Again review[\s\S]*22023/)
    expect(sql).toMatch(/FOREIGN KEY \(review_log_id, user_id\) REFERENCES public\.review_logs\(id, user_id\)/)
    expect(sql).toMatch(/review_cards_last_answer_id_fkey/)
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.review_cards, public\.review_logs, public\.review_error_reasons,[\s\S]*public\.review_error_annotations TO service_role/)
  })
})

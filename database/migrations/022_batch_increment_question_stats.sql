-- Migration 022: Batch question stats RPC
-- Tek RPC ile N sorunun istatistiklerini gunceller.
-- sessions/route.ts'deki N ayri increment_question_stats cagrisini tek cagiriya dusurur.

CREATE OR REPLACE FUNCTION batch_increment_question_stats(
  q_ids uuid[],
  correct_flags boolean[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Ayni soru birden fazla kez gelebilir (edge case), aggregate ile handle et
  UPDATE questions SET
    times_answered = questions.times_answered + t.total_answered,
    times_correct = questions.times_correct + t.total_correct
  FROM (
    SELECT
      qid,
      COUNT(*)::integer AS total_answered,
      COUNT(*) FILTER (WHERE is_correct)::integer AS total_correct
    FROM unnest(q_ids, correct_flags) AS x(qid, is_correct)
    GROUP BY qid
  ) t
  WHERE questions.id = t.qid;
END;
$$;

-- Sadece service_role ve authenticated kullanabilsin
REVOKE ALL ON FUNCTION batch_increment_question_stats(uuid[], boolean[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION batch_increment_question_stats(uuid[], boolean[]) TO service_role;
GRANT EXECUTE ON FUNCTION batch_increment_question_stats(uuid[], boolean[]) TO authenticated;

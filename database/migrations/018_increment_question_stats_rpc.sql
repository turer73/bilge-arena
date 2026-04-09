-- Migration 018: Soru istatistikleri atomic increment RPC
-- Race condition olmadan times_answered ve times_correct gunceller.

CREATE OR REPLACE FUNCTION increment_question_stats(
  q_id uuid,
  answered_inc integer DEFAULT 1,
  correct_inc integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE questions
  SET
    times_answered = times_answered + answered_inc,
    times_correct = times_correct + correct_inc
  WHERE id = q_id;
END;
$$;

-- Sadece service_role ve authenticated kullanabilsin
REVOKE ALL ON FUNCTION increment_question_stats(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_question_stats(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION increment_question_stats(uuid, integer, integer) TO authenticated;

-- Eski verileri duzelt: session_answers'dan hesapla
UPDATE questions q SET
  times_answered = COALESCE(stats.total, 0),
  times_correct = COALESCE(stats.correct, 0)
FROM (
  SELECT
    question_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE is_correct = true) AS correct
  FROM session_answers
  GROUP BY question_id
) stats
WHERE q.id = stats.question_id;

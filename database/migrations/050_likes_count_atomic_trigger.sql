-- Migration 050: comment_likes -> comments.likes_count atomic trigger
--
-- Klipper review Note #108 H-149-3:
--   comments tablosunda likes_count sutunu denormalize edilmis. PR #149
--   client-side optimistic update + API upsert/delete kullaniyor:
--     - POST /api/comments/[id]/like  -> comment_likes upsert
--     - DELETE /api/comments/[id]/like -> comment_likes delete
--   Ama comments.likes_count sutununu UPDATE etmiyor.
--
--   Race: iki kullanici ayni anda like atarsa likes_count drift eder.
--   Eski client-side increment de race-prone idi. PostgreSQL trigger ile
--   atomic guncelleme garantilenmeli.
--
-- Cozum:
--   AFTER INSERT/DELETE ON comment_likes trigger -> COUNT(*) ile yeniden
--   hesaplayip comments.likes_count'a yaz.
--
-- Bonus: existing data drift'i duzelt (bir kez calistirilir, sonra trigger
--   tutarliligi korur).

BEGIN;

-- 1) Trigger fonksiyonu
CREATE OR REPLACE FUNCTION public.sync_comment_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment_id uuid;
BEGIN
  -- TG_OP: INSERT veya DELETE
  v_comment_id := COALESCE(NEW.comment_id, OLD.comment_id);

  UPDATE public.comments
  SET likes_count = (
    SELECT COUNT(*)::integer
    FROM public.comment_likes
    WHERE comment_id = v_comment_id
  )
  WHERE id = v_comment_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_comment_likes_count() FROM PUBLIC, anon, authenticated;

-- 2) Trigger'lari kur (INSERT + DELETE)
DROP TRIGGER IF EXISTS sync_likes_count_on_insert ON public.comment_likes;
CREATE TRIGGER sync_likes_count_on_insert
  AFTER INSERT ON public.comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_comment_likes_count();

DROP TRIGGER IF EXISTS sync_likes_count_on_delete ON public.comment_likes;
CREATE TRIGGER sync_likes_count_on_delete
  AFTER DELETE ON public.comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_comment_likes_count();

-- 3) Existing drift duzeltme (bir seferlik backfill)
UPDATE public.comments c
SET likes_count = sub.actual_count
FROM (
  SELECT comment_id, COUNT(*)::integer AS actual_count
  FROM public.comment_likes
  GROUP BY comment_id
) sub
WHERE c.id = sub.comment_id
  AND c.likes_count IS DISTINCT FROM sub.actual_count;

-- Comment_likes hic yok ama likes_count > 0 olan kayitlari da sifirla
UPDATE public.comments
SET likes_count = 0
WHERE likes_count > 0
  AND id NOT IN (SELECT DISTINCT comment_id FROM public.comment_likes);

COMMIT;

-- Dogrulama (manuel):
--   SELECT c.id, c.likes_count, COUNT(cl.*) AS actual
--   FROM comments c
--   LEFT JOIN comment_likes cl ON cl.comment_id = c.id
--   GROUP BY c.id, c.likes_count
--   HAVING c.likes_count <> COUNT(cl.*);
--   -- 0 satir donmeli (drift yok)

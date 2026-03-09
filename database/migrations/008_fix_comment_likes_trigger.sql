-- Migration 008: Yorum begeni trigger'ina SECURITY DEFINER ekle
-- comment_likes INSERT/DELETE -> comments.likes_count UPDATE
-- comments tablosunda sadece kendi yorumunu guncelleyebilir (RLS),
-- ama baskasinin yorumunu begendiginde likes_count guncellenmeli

CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments
    SET likes_count = likes_count + 1
    WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments
    SET likes_count = likes_count - 1
    WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

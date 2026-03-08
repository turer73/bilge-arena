-- Migration 002: Yorum ve begeni sistemi
-- comments, comment_likes, question_likes tablolari

-- =============================================
-- 1. COMMENTS TABLOSU
-- =============================================
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  parent_id   UUID REFERENCES public.comments(id) ON DELETE CASCADE, -- yanit icin
  is_deleted  BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexler
CREATE INDEX idx_comments_question ON public.comments(question_id, created_at DESC);
CREATE INDEX idx_comments_user ON public.comments(user_id);
CREATE INDEX idx_comments_parent ON public.comments(parent_id) WHERE parent_id IS NOT NULL;

-- RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Herkes gorebilir (silinmemis olanlar)
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (is_deleted = false);

-- Giris yapmis kullanici yorum yazabilir
CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Kendi yorumunu guncelleyebilir
CREATE POLICY "comments_update" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Kendi yorumunu silebilir (soft delete)
CREATE POLICY "comments_delete" ON public.comments
  FOR DELETE USING (auth.uid() = user_id);


-- =============================================
-- 2. COMMENT_LIKES TABLOSU
-- =============================================
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, comment_id)
);

CREATE INDEX idx_comment_likes_comment ON public.comment_likes(comment_id);

-- RLS
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_likes_select" ON public.comment_likes
  FOR SELECT USING (true);

CREATE POLICY "comment_likes_insert" ON public.comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comment_likes_delete" ON public.comment_likes
  FOR DELETE USING (auth.uid() = user_id);


-- =============================================
-- 3. QUESTION_LIKES TABLOSU
-- =============================================
CREATE TABLE IF NOT EXISTS public.question_likes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX idx_question_likes_question ON public.question_likes(question_id);

-- RLS
ALTER TABLE public.question_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_likes_select" ON public.question_likes
  FOR SELECT USING (true);

CREATE POLICY "question_likes_insert" ON public.question_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "question_likes_delete" ON public.question_likes
  FOR DELETE USING (auth.uid() = user_id);


-- =============================================
-- 4. TRIGGER: Yorum begeni sayisini guncelle
-- =============================================
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_likes_count
AFTER INSERT OR DELETE ON public.comment_likes
FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();

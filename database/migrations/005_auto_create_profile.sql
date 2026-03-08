-- Migration 005: Yeni kullanici kayit oldugunda otomatik profil olustur
-- auth.users'a INSERT oldugunda profiles tablosuna da kayit ekler

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username VARCHAR(32);
BEGIN
  -- Email'den username olustur (@ oncesi + random suffix)
  v_username := LOWER(SPLIT_PART(NEW.email, '@', 1));
  -- Max 24 karakter + 4 random
  v_username := LEFT(v_username, 24) || '_' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', v_username),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auth.users'a yeni kayit geldiginde calis
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

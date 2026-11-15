-- 232 geri alma: geri cekme yolu kapanir; gecmisteki rejected durumlari ve istek defteri korunur.
BEGIN;
DROP FUNCTION IF EXISTS public.withdraw_question_content_revision(uuid,uuid,text,uuid);
NOTIFY pgrst,'reload schema';
COMMIT;

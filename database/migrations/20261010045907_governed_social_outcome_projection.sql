-- Reviewed Social publication owns its revision-specific outcome projection.
-- The legacy category guess must not run between the question update and the
-- normal publisher's exact revision-outcome copy. No publication/role override.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.trg_sync_taxonomy_auto_question_outcomes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND NEW.is_active IS TRUE
    AND NEW.game::text='sosyal' AND NEW.exam_ref::text='TYT'
    AND EXISTS (
      SELECT 1 FROM public.content_governance_write_context c
      WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
        AND c.question_id=NEW.id AND c.operation='publish'
    ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.question_content_revisions r
      WHERE r.id=NEW.published_revision_id AND r.question_id=NEW.id
        AND r.status IN ('stage1_approved','stage2_approved')
        AND r.game=NEW.game::text AND r.exam_ref=NEW.exam_ref::text
        AND r.category=NEW.category::text AND r.content=NEW.content
        AND r.content_sha256=encode(extensions.digest(r.content::text,'sha256'),'hex')
        AND public.question_revision_outcomes_valid(r.id)
    ) THEN
      RAISE EXCEPTION 'governed Social publish requires exact approved revision outcomes'
        USING ERRCODE='23514';
    END IF;
    -- publish_question_content_revision copies the accepted mapping immediately
    -- after this UPDATE. Existing deferred scope integrity still checks COMMIT.
    RETURN NEW;
  END IF;
  PERFORM public.sync_taxonomy_auto_question_outcomes(
    NEW.id,NEW.game::text,NEW.exam_ref::text,NEW.category::text,COALESCE(NEW.is_active,false)
  );
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.trg_sync_taxonomy_auto_question_outcomes()
  FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

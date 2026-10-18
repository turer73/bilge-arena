-- Internal, narrowly scoped literature skill for governed AYT-SOZ revisions.
-- This is NOT an official MEB outcome code or a curriculum release. The MEB
-- Turkish Language and Literature programme (ProgramDetay.aspx?PID=353) and
-- grade-10 Divan poetry material (odsgm.meb.gov.tr/destekmateryal/pdf/10kt/turk/8.pdf)
-- support the topic. Source/quality review remains mandatory for each question.
-- No question, mapping, approval, release registry or diagnostic flag changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.curriculum_nodes, public.curriculum_outcomes IN SHARE ROW EXCLUSIVE MODE;

DO $seed$
DECLARE
  r record;
  parent_uuid uuid;
  leaf_uuid uuid;
  taxonomy constant text := 'ba-ayt-soz-turkce-v1';
  description_text constant text := 'Bilge Arena iç öğrenme grafiği becerisidir; resmî MEB kazanım kodu değildir. Divan şiirinde mazmun ve imge anlamını çözümleme.';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('course','course',NULL::text,NULL::text,'AYT Türk Dili ve Edebiyatı'),
    ('unit:siir','unit','course',NULL,'Şiir'),
    ('topic:divan-mazmun','topic','unit:siir','edebiyat','Divan şiirinde mazmun ve imge'),
    ('outcome:divan-mazmun','outcome','topic:divan-mazmun','edebiyat','Divan şiirinde mazmun anlamını çözümleme')
  ) AS expected(suffix,node_type,parent_suffix,category,title) LOOP
    parent_uuid := NULL;
    IF r.parent_suffix IS NOT NULL THEN
      SELECT id INTO STRICT parent_uuid FROM public.curriculum_nodes
      WHERE code=taxonomy||':'||r.parent_suffix;
    END IF;
    INSERT INTO public.curriculum_nodes
      (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
    VALUES (taxonomy||':'||r.suffix,taxonomy,'turkce','AYT-SOZ',r.node_type,parent_uuid,r.category,r.title,10,true)
    ON CONFLICT (code) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.curriculum_nodes n
      WHERE n.code=taxonomy||':'||r.suffix AND n.taxonomy_version=taxonomy
        AND n.game='turkce' AND n.exam_ref='AYT-SOZ' AND n.node_type=r.node_type
        AND n.parent_id IS NOT DISTINCT FROM parent_uuid
        AND n.category IS NOT DISTINCT FROM r.category AND n.title=r.title
        AND n.sort_order=10 AND n.is_active) THEN
      RAISE EXCEPTION '226 literature node conflicts with reviewed seed: %',r.suffix USING ERRCODE='22023';
    END IF;
  END LOOP;
  SELECT id INTO STRICT leaf_uuid FROM public.curriculum_nodes
    WHERE code=taxonomy||':outcome:divan-mazmun';
  INSERT INTO public.curriculum_outcomes
    (code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version)
  VALUES ('BA-AYTSOZ-EDB-MAZ-01','turkce','edebiyat','Divan şiirinde mazmun anlamını çözümleme',
    description_text,'AYT-SOZ',10,true,leaf_uuid,taxonomy)
  ON CONFLICT (code) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.curriculum_outcomes o
    WHERE o.code='BA-AYTSOZ-EDB-MAZ-01' AND o.game='turkce' AND o.category='edebiyat'
      AND o.title='Divan şiirinde mazmun anlamını çözümleme' AND o.description=description_text
      AND o.exam_ref='AYT-SOZ' AND o.sort_order=10 AND o.is_active
      AND o.node_id=leaf_uuid AND o.taxonomy_version=taxonomy) THEN
    RAISE EXCEPTION '226 literature outcome conflicts with reviewed seed' USING ERRCODE='22023';
  END IF;
END $seed$;
COMMIT;

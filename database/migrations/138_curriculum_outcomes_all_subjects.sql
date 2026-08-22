-- Migration 138: matematik disi derslere ogrenme grafigi kazanimlari.
--
-- SORUN. Migration 136'nin yayin kapisi acik (enforce_publish_gate=true), yayin
-- revizyon istiyor, create_question_content_revision ise payload dogrulamasinda
-- EN AZ BIR aktif kazanim sarti kosuyor:
--     IF jsonb_array_length(v_outcomes) NOT BETWEEN 1 AND 5 ... RETURN false
-- Fakat curriculum_outcomes yalniz matematik icin dolduruldu (096, 6 kazanim).
--
-- OLCUM (2026-08-21): 4427 aktif sorunun 779'u (%17.6) icin governance yoluyla
-- icerik duzeltmesi mumkun, 3648'i (%82.4) icin IMKANSIZ. Bu bir tasarim kusuru
-- DEGIL veri eksikligi; kapi dogru calisiyor, grafik eksik.
--
-- SOMUT TETIKLEYICI. Otomatik denetim 7 dogrulanmis yanlis cevap anahtari buldu
-- ve hepsi karantinaya alindi. Bunlarin 4'u (2 kimya + 2 fizik) DUZELTILEMIYOR,
-- cunku o derslerde hic kazanim tanimli degil.
--
-- KAPSAM. 096'daki matematik deseni birebir izlenir: course -> unit -> topic ->
-- outcome dugumleri, sonra curriculum_outcomes leaf satirlari. Dort taksonomi:
-- turkce, sosyal, fen (TYT) ve wordquest (YDT). 21 kategori kapsanir.
--
-- SINIR (bilerek). Bunlar 096'daki gibi KABA, kategori-basina-tek leaf
-- becerileridir ve description alani bunu acikca soyler: "Bilge Arena ic
-- ogrenme grafigi leaf becerisidir; resmi mufredat kodu degildir." Resmi MEB
-- kazanim kodlamasi DEGILDIR ve oyle sunulmamalidir. Amac governance zincirini
-- calisir hale getirmek; ileride daha ince taksonomiye yer birakir.
--
-- IDEMPOTENT. Tum INSERT'ler ON CONFLICT (code) DO UPDATE; tekrar kosulabilir.

BEGIN;

-- ── turkce (ba-tyt-turkce-v1) ──────────────────────────────────────────────
INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
VALUES ('ba-tyt-turkce-v1:course','ba-tyt-turkce-v1','turkce','TYT','course',NULL,NULL,'TYT Türkçe',10,true)
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-turkce-v1','turkce','TYT','unit',course.id,NULL,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-turkce-v1:unit:okuma','Okuduğunu Anlama',10),
  ('ba-tyt-turkce-v1:unit:dil-bilgisi','Dil Bilgisi',20),
  ('ba-tyt-turkce-v1:unit:soz-varligi','Anlam ve Söz Varlığı',30),
  ('ba-tyt-turkce-v1:unit:edebiyat','Edebiyat',40)
) AS v(code,title,sort_order)
JOIN public.curriculum_nodes course ON course.code='ba-tyt-turkce-v1:course'
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-turkce-v1','turkce','TYT','topic',unit.id,v.category,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-turkce-v1:topic:paragraf','ba-tyt-turkce-v1:unit:okuma','paragraf','Paragraf',10),
  ('ba-tyt-turkce-v1:topic:dil_bilgisi','ba-tyt-turkce-v1:unit:dil-bilgisi','dil_bilgisi','Dil Bilgisi',20),
  ('ba-tyt-turkce-v1:topic:yazim_kurallari','ba-tyt-turkce-v1:unit:dil-bilgisi','yazim_kurallari','Yazım Kuralları',30),
  ('ba-tyt-turkce-v1:topic:sozcuk','ba-tyt-turkce-v1:unit:soz-varligi','sozcuk','Sözcükte Anlam',40),
  ('ba-tyt-turkce-v1:topic:anlam_bilgisi','ba-tyt-turkce-v1:unit:soz-varligi','anlam_bilgisi','Anlam Bilgisi',50),
  ('ba-tyt-turkce-v1:topic:edebiyat','ba-tyt-turkce-v1:unit:edebiyat','edebiyat','Edebiyat',60)
) AS v(code,unit_code,category,title,sort_order)
JOIN public.curriculum_nodes unit ON unit.code=v.unit_code
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT replace(topic.code,':topic:',':outcome:'),'ba-tyt-turkce-v1','turkce','TYT','outcome',topic.id,topic.category,v.title,10,true
FROM (VALUES
  ('paragraf','Paragrafta anlam kurma becerisi'),
  ('dil_bilgisi','Dil bilgisi çözümleme becerisi'),
  ('yazim_kurallari','Yazım ve noktalama becerisi'),
  ('sozcuk','Sözcükte anlam becerisi'),
  ('anlam_bilgisi','Cümlede anlam becerisi'),
  ('edebiyat','Edebî metin bilgisi becerisi')
) AS v(category,title)
JOIN public.curriculum_nodes topic ON topic.code='ba-tyt-turkce-v1:topic:'||v.category
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_outcomes (code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version)
SELECT v.code,'turkce',v.category,v.title,
  'Bilge Arena iç öğrenme grafiği leaf becerisidir; resmî müfredat kodu değildir.',
  'TYT',v.sort_order,true,node.id,'ba-tyt-turkce-v1'
FROM (VALUES
  ('TUR-PAR-01','paragraf','Paragrafta anlam kurma becerisi',10),
  ('TUR-DIL-01','dil_bilgisi','Dil bilgisi çözümleme becerisi',20),
  ('TUR-YAZ-01','yazim_kurallari','Yazım ve noktalama becerisi',30),
  ('TUR-SOZ-01','sozcuk','Sözcükte anlam becerisi',40),
  ('TUR-ANL-01','anlam_bilgisi','Cümlede anlam becerisi',50),
  ('TUR-EDB-01','edebiyat','Edebî metin bilgisi becerisi',60)
) AS v(code,category,title,sort_order)
JOIN public.curriculum_nodes node ON node.code='ba-tyt-turkce-v1:outcome:'||v.category
ON CONFLICT (code) DO UPDATE SET
  game=EXCLUDED.game, category=EXCLUDED.category, title=EXCLUDED.title,
  description=EXCLUDED.description, exam_ref=EXCLUDED.exam_ref, sort_order=EXCLUDED.sort_order,
  is_active=EXCLUDED.is_active, node_id=EXCLUDED.node_id, taxonomy_version=EXCLUDED.taxonomy_version;

-- ── sosyal (ba-tyt-sosyal-v1) ──────────────────────────────────────────────
INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
VALUES ('ba-tyt-sosyal-v1:course','ba-tyt-sosyal-v1','sosyal','TYT','course',NULL,NULL,'TYT Sosyal Bilimler',10,true)
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-sosyal-v1','sosyal','TYT','unit',course.id,NULL,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-sosyal-v1:unit:tarih','Tarih',10),
  ('ba-tyt-sosyal-v1:unit:cografya','Coğrafya',20),
  ('ba-tyt-sosyal-v1:unit:felsefe-grubu','Felsefe Grubu',30),
  ('ba-tyt-sosyal-v1:unit:din-kulturu','Din Kültürü',40)
) AS v(code,title,sort_order)
JOIN public.curriculum_nodes course ON course.code='ba-tyt-sosyal-v1:course'
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-sosyal-v1','sosyal','TYT','topic',unit.id,v.category,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-sosyal-v1:topic:tarih','ba-tyt-sosyal-v1:unit:tarih','tarih','Tarih',10),
  ('ba-tyt-sosyal-v1:topic:cografya','ba-tyt-sosyal-v1:unit:cografya','cografya','Coğrafya',20),
  ('ba-tyt-sosyal-v1:topic:felsefe','ba-tyt-sosyal-v1:unit:felsefe-grubu','felsefe','Felsefe',30),
  ('ba-tyt-sosyal-v1:topic:sosyoloji','ba-tyt-sosyal-v1:unit:felsefe-grubu','sosyoloji','Sosyoloji',40),
  ('ba-tyt-sosyal-v1:topic:din_kulturu','ba-tyt-sosyal-v1:unit:din-kulturu','din_kulturu','Din Kültürü',50)
) AS v(code,unit_code,category,title,sort_order)
JOIN public.curriculum_nodes unit ON unit.code=v.unit_code
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT replace(topic.code,':topic:',':outcome:'),'ba-tyt-sosyal-v1','sosyal','TYT','outcome',topic.id,topic.category,v.title,10,true
FROM (VALUES
  ('tarih','Tarihsel akıl yürütme becerisi'),
  ('cografya','Coğrafi çözümleme becerisi'),
  ('felsefe','Felsefi akıl yürütme becerisi'),
  ('sosyoloji','Toplumsal çözümleme becerisi'),
  ('din_kulturu','Din kültürü bilgi becerisi')
) AS v(category,title)
JOIN public.curriculum_nodes topic ON topic.code='ba-tyt-sosyal-v1:topic:'||v.category
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_outcomes (code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version)
SELECT v.code,'sosyal',v.category,v.title,
  'Bilge Arena iç öğrenme grafiği leaf becerisidir; resmî müfredat kodu değildir.',
  'TYT',v.sort_order,true,node.id,'ba-tyt-sosyal-v1'
FROM (VALUES
  ('SOS-TAR-01','tarih','Tarihsel akıl yürütme becerisi',10),
  ('SOS-COG-01','cografya','Coğrafi çözümleme becerisi',20),
  ('SOS-FEL-01','felsefe','Felsefi akıl yürütme becerisi',30),
  ('SOS-SOS-01','sosyoloji','Toplumsal çözümleme becerisi',40),
  ('SOS-DIN-01','din_kulturu','Din kültürü bilgi becerisi',50)
) AS v(code,category,title,sort_order)
JOIN public.curriculum_nodes node ON node.code='ba-tyt-sosyal-v1:outcome:'||v.category
ON CONFLICT (code) DO UPDATE SET
  game=EXCLUDED.game, category=EXCLUDED.category, title=EXCLUDED.title,
  description=EXCLUDED.description, exam_ref=EXCLUDED.exam_ref, sort_order=EXCLUDED.sort_order,
  is_active=EXCLUDED.is_active, node_id=EXCLUDED.node_id, taxonomy_version=EXCLUDED.taxonomy_version;

-- ── fen (ba-tyt-fen-v1) ────────────────────────────────────────────────────
INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
VALUES ('ba-tyt-fen-v1:course','ba-tyt-fen-v1','fen','TYT','course',NULL,NULL,'TYT Fen Bilimleri',10,true)
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-fen-v1','fen','TYT','unit',course.id,NULL,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-fen-v1:unit:fizik','Fizik',10),
  ('ba-tyt-fen-v1:unit:kimya','Kimya',20),
  ('ba-tyt-fen-v1:unit:biyoloji','Biyoloji',30)
) AS v(code,title,sort_order)
JOIN public.curriculum_nodes course ON course.code='ba-tyt-fen-v1:course'
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-fen-v1','fen','TYT','topic',unit.id,v.category,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-fen-v1:topic:fizik','ba-tyt-fen-v1:unit:fizik','fizik','Fizik',10),
  ('ba-tyt-fen-v1:topic:kimya','ba-tyt-fen-v1:unit:kimya','kimya','Kimya',20),
  ('ba-tyt-fen-v1:topic:biyoloji','ba-tyt-fen-v1:unit:biyoloji','biyoloji','Biyoloji',30)
) AS v(code,unit_code,category,title,sort_order)
JOIN public.curriculum_nodes unit ON unit.code=v.unit_code
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT replace(topic.code,':topic:',':outcome:'),'ba-tyt-fen-v1','fen','TYT','outcome',topic.id,topic.category,v.title,10,true
FROM (VALUES
  ('fizik','Fiziksel akıl yürütme becerisi'),
  ('kimya','Kimyasal çözümleme becerisi'),
  ('biyoloji','Biyolojik çözümleme becerisi')
) AS v(category,title)
JOIN public.curriculum_nodes topic ON topic.code='ba-tyt-fen-v1:topic:'||v.category
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_outcomes (code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version)
SELECT v.code,'fen',v.category,v.title,
  'Bilge Arena iç öğrenme grafiği leaf becerisidir; resmî müfredat kodu değildir.',
  'TYT',v.sort_order,true,node.id,'ba-tyt-fen-v1'
FROM (VALUES
  ('FEN-FIZ-01','fizik','Fiziksel akıl yürütme becerisi',10),
  ('FEN-KIM-01','kimya','Kimyasal çözümleme becerisi',20),
  ('FEN-BIY-01','biyoloji','Biyolojik çözümleme becerisi',30)
) AS v(code,category,title,sort_order)
JOIN public.curriculum_nodes node ON node.code='ba-tyt-fen-v1:outcome:'||v.category
ON CONFLICT (code) DO UPDATE SET
  game=EXCLUDED.game, category=EXCLUDED.category, title=EXCLUDED.title,
  description=EXCLUDED.description, exam_ref=EXCLUDED.exam_ref, sort_order=EXCLUDED.sort_order,
  is_active=EXCLUDED.is_active, node_id=EXCLUDED.node_id, taxonomy_version=EXCLUDED.taxonomy_version;

-- ── wordquest (ba-ydt-eng-v1) ──────────────────────────────────────────────
INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
VALUES ('ba-ydt-eng-v1:course','ba-ydt-eng-v1','wordquest','YDT','course',NULL,NULL,'YDT İngilizce',10,true)
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-ydt-eng-v1','wordquest','YDT','unit',course.id,NULL,v.title,v.sort_order,true
FROM (VALUES
  ('ba-ydt-eng-v1:unit:kelime','Kelime Bilgisi',10),
  ('ba-ydt-eng-v1:unit:yapi','Dil Yapıları',20),
  ('ba-ydt-eng-v1:unit:aktarim','Anlama ve Aktarım',30)
) AS v(code,title,sort_order)
JOIN public.curriculum_nodes course ON course.code='ba-ydt-eng-v1:course'
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-ydt-eng-v1','wordquest','YDT','topic',unit.id,v.category,v.title,v.sort_order,true
FROM (VALUES
  ('ba-ydt-eng-v1:topic:vocabulary','ba-ydt-eng-v1:unit:kelime','vocabulary','Kelime Bilgisi',10),
  ('ba-ydt-eng-v1:topic:phrasal_verbs','ba-ydt-eng-v1:unit:kelime','phrasal_verbs','Phrasal Verbs',20),
  ('ba-ydt-eng-v1:topic:grammar','ba-ydt-eng-v1:unit:yapi','grammar','Dil Bilgisi',30),
  ('ba-ydt-eng-v1:topic:sentence_completion','ba-ydt-eng-v1:unit:yapi','sentence_completion','Cümle Tamamlama',40),
  ('ba-ydt-eng-v1:topic:cloze_test','ba-ydt-eng-v1:unit:yapi','cloze_test','Cloze Test',50),
  ('ba-ydt-eng-v1:topic:restatement','ba-ydt-eng-v1:unit:aktarim','restatement','Restatement',60),
  ('ba-ydt-eng-v1:topic:dialogue','ba-ydt-eng-v1:unit:aktarim','dialogue','Diyalog',70)
) AS v(code,unit_code,category,title,sort_order)
JOIN public.curriculum_nodes unit ON unit.code=v.unit_code
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT replace(topic.code,':topic:',':outcome:'),'ba-ydt-eng-v1','wordquest','YDT','outcome',topic.id,topic.category,v.title,10,true
FROM (VALUES
  ('vocabulary','Kelime bilgisi becerisi'),
  ('phrasal_verbs','Deyimsel fiil becerisi'),
  ('grammar','İngilizce yapı bilgisi becerisi'),
  ('sentence_completion','Cümle tamamlama becerisi'),
  ('cloze_test','Bağlamdan çıkarım becerisi'),
  ('restatement','Yeniden ifade etme becerisi'),
  ('dialogue','Diyalog tamamlama becerisi')
) AS v(category,title)
JOIN public.curriculum_nodes topic ON topic.code='ba-ydt-eng-v1:topic:'||v.category
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_outcomes (code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version)
SELECT v.code,'wordquest',v.category,v.title,
  'Bilge Arena iç öğrenme grafiği leaf becerisidir; resmî müfredat kodu değildir.',
  'YDT',v.sort_order,true,node.id,'ba-ydt-eng-v1'
FROM (VALUES
  ('ENG-VOC-01','vocabulary','Kelime bilgisi becerisi',10),
  ('ENG-PHR-01','phrasal_verbs','Deyimsel fiil becerisi',20),
  ('ENG-GRM-01','grammar','İngilizce yapı bilgisi becerisi',30),
  ('ENG-SEN-01','sentence_completion','Cümle tamamlama becerisi',40),
  ('ENG-CLZ-01','cloze_test','Bağlamdan çıkarım becerisi',50),
  ('ENG-RES-01','restatement','Yeniden ifade etme becerisi',60),
  ('ENG-DLG-01','dialogue','Diyalog tamamlama becerisi',70)
) AS v(code,category,title,sort_order)
JOIN public.curriculum_nodes node ON node.code='ba-ydt-eng-v1:outcome:'||v.category
ON CONFLICT (code) DO UPDATE SET
  game=EXCLUDED.game, category=EXCLUDED.category, title=EXCLUDED.title,
  description=EXCLUDED.description, exam_ref=EXCLUDED.exam_ref, sort_order=EXCLUDED.sort_order,
  is_active=EXCLUDED.is_active, node_id=EXCLUDED.node_id, taxonomy_version=EXCLUDED.taxonomy_version;

-- Dogrulama: 21 yeni kategori kazanimi + mevcut 6 matematik = 27 aktif kazanim.
DO $$
DECLARE v_count integer; v_orphan integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.curriculum_outcomes WHERE is_active;
  IF v_count < 27 THEN
    RAISE EXCEPTION 'Migration 138 dogrulama basarisiz: aktif kazanim=%, en az 27 beklenir', v_count;
  END IF;
  -- Her kazanim bir outcome dugumune bagli olmali; yoksa create_question_content_revision
  -- JOIN'i sessizce bos doner ve "outcomes must be active and unique" hatasi alinir.
  SELECT count(*) INTO v_orphan
  FROM public.curriculum_outcomes o
  LEFT JOIN public.curriculum_nodes n ON n.id=o.node_id AND n.node_type='outcome'
  WHERE o.is_active AND n.id IS NULL;
  IF v_orphan <> 0 THEN
    RAISE EXCEPTION 'Migration 138 dogrulama basarisiz: % kazanim outcome dugumune bagli degil', v_orphan;
  END IF;
END $$;

COMMIT;

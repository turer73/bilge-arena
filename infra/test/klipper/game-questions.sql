-- Synthetic interaction fixtures, NOT a curriculum-validated exam bank.
-- Applied before 106 so the real governance migration creates immutable
-- published revisions; no security trigger is disabled for seed insertion.
DO $$ BEGIN
  IF current_database() <> 'academy_game_test' THEN RAISE EXCEPTION 'Test only'; END IF;
END $$;
DO $$
DECLARE
  cat text; n integer; correct_value integer; stem text; solution text;
  opts text[]; answer_index integer; cats text[] := ARRAY['sayilar','problemler','geometri','denklemler','fonksiyonlar','olasilik'];
BEGIN
  FOREACH cat IN ARRAY cats LOOP
    FOR n IN 1..200 LOOP
      CASE cat
        WHEN 'sayilar' THEN stem:=format('%s + 7 işleminin sonucu kaçtır?',n); correct_value:=n+7; solution:='Verilen sayıya 7 eklenir.';
        WHEN 'problemler' THEN stem:=format('Bir kutuda 3 kalem var. %s kutuda kaç kalem vardır?',n); correct_value:=n*3; solution:='Kutu sayısı 3 ile çarpılır.';
        WHEN 'geometri' THEN stem:=format('Bir kenarı %s cm olan karenin çevresi kaç cm olur?',n); correct_value:=n*4; solution:='Karenin çevresi bir kenarının 4 katıdır.';
        WHEN 'denklemler' THEN stem:=format('x + 5 = %s olduğuna göre x kaçtır?',n+5); correct_value:=n; solution:='Eşitliğin iki tarafından 5 çıkarılır.';
        WHEN 'fonksiyonlar' THEN stem:=format('f(x) = 2x + 3 ise f(%s) kaçtır?',n); correct_value:=2*n+3; solution:='x yerine verilen sayı yazılır; önce çarpma yapılır.';
        WHEN 'olasilik' THEN stem:=format('Bir torbada %s kırmızı ve 2 mavi bilye vardır. Olasılık hesabında kullanılacak tüm olası bilye sayısı kaçtır?',n); correct_value:=n+2; solution:='Kırmızı ve mavi bilye sayıları toplanır.';
      END CASE;
      answer_index:=n%5;
      opts:=ARRAY[(correct_value+1)::text,(correct_value+2)::text,(correct_value+3)::text,(correct_value+4)::text,(correct_value+5)::text];
      opts[answer_index+1]:=correct_value::text;
      INSERT INTO public.questions(external_id,game,category,difficulty,is_boss,exam_ref,source,topic,content)
      VALUES ('test-m'||array_position(cats,cat)||'-'||n,'matematik',cat,1+(n%5),n%5=4,'TYT','isolated-test','Sentetik arayüz testi',
        jsonb_build_object('question','[Test sorusu] '||stem,'options',to_jsonb(opts),'answer',answer_index,'solution',solution,'type','multiple_choice'));
    END LOOP;
  END LOOP;
END $$;
INSERT INTO public.questions(external_id,game,category,difficulty,exam_ref,level_tag,source,topic,content)
SELECT 'test-'||b.prefix||'-'||n,b.game,b.category,1+(n%5),b.exam_ref,b.level_tag,'isolated-test','Sentetik arayüz testi',
  jsonb_build_object('question',format('[Test sorusu %s] %s',n,b.stem),'options',b.options || jsonb_build_array(CASE b.game WHEN 'turkce' THEN 'Okumanın düşünceye etkisi yoktur.' WHEN 'fen' THEN 'Kelvin' WHEN 'sosyal' THEN '1922' ELSE 'house' END),'answer',0,'solution',b.solution,'type','multiple_choice')
FROM (VALUES
 ('t','turkce','paragraf','TYT',NULL::text,'"Her gün biraz okumak, zamanla düşünce dünyamızı zenginleştirir." cümlesinin ana düşüncesi nedir?', '["Düzenli okuma düşünceyi geliştirir.","Okumak yalnızca eğlencedir.","Bir gün okumak yeterlidir.","Okuma zaman kaybıdır."]'::jsonb,'Cümle, düzenli okumanın zaman içindeki olumlu etkisini vurgular.'),
 ('f','fen','fizik','TYT',NULL,'SI birim sisteminde kuvvetin birimi hangisidir?', '["Newton","Metre","Saniye","Kilogram"]'::jsonb,'Kuvvetin SI birimi Newtondur.'),
 ('s','sosyal','tarih','TYT',NULL,'Türkiye Büyük Millet Meclisi hangi yıl açılmıştır?', '["1920","1923","1919","1938"]'::jsonb,'TBMM 23 Nisan 1920 tarihinde açılmıştır.'),
 ('w','wordquest','vocabulary','YDT','A1','Choose the word that means "kitap".', '["book","water","tree","door"]'::jsonb,'Book, Türkçede kitap demektir.')
) AS b(prefix,game,category,exam_ref,level_tag,stem,options,solution)
CROSS JOIN generate_series(1,100) n;

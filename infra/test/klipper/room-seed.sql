-- Synthetic-only fixture for infra/test/klipper/room-bootstrap.sh.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active, source, exam_ref)
VALUES
  ('synthetic-room-001','matematik','denklemler',2,'{"question":"Sentetik cebir 1: x + 1 = 3 ise x kaçtır?","options":["1","2","3","4"],"answer":"1"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-002','matematik','denklemler',2,'{"question":"Sentetik cebir 2: 2x = 8 ise x kaçtır?","options":["2","3","4","5"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-003','matematik','denklemler',2,'{"question":"Sentetik cebir 3: x - 5 = 0 ise x kaçtır?","options":["3","4","5","6"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-004','matematik','denklemler',2,'{"question":"Sentetik cebir 4: 3 + x = 10 ise x kaçtır?","options":["5","6","7","8"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-005','matematik','denklemler',2,'{"question":"Sentetik cebir 5: 4x = 12 ise x kaçtır?","options":["1","2","3","4"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-006','matematik','denklemler',2,'{"question":"Sentetik cebir 6: x / 2 = 4 ise x kaçtır?","options":["6","7","8","9"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-007','matematik','denklemler',2,'{"question":"Sentetik cebir 7: x + 9 = 9 ise x kaçtır?","options":["0","1","2","3"],"answer":"0"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-008','matematik','denklemler',2,'{"question":"Sentetik cebir 8: 5x = 20 ise x kaçtır?","options":["2","3","4","5"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-009','matematik','denklemler',2,'{"question":"Sentetik cebir 9: x - 2 = 6 ise x kaçtır?","options":["6","7","8","9"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST'),
  ('synthetic-room-010','matematik','denklemler',2,'{"question":"Sentetik cebir 10: 7 + x = 12 ise x kaçtır?","options":["3","4","5","6"],"answer":"2"}'::jsonb,TRUE,'synthetic-room-bootstrap','TEST')
ON CONFLICT (external_id) DO UPDATE SET
  game=EXCLUDED.game, category=EXCLUDED.category, difficulty=EXCLUDED.difficulty,
  content=EXCLUDED.content, is_active=EXCLUDED.is_active, source=EXCLUDED.source,
  exam_ref=EXCLUDED.exam_ref, updated_at=clock_timestamp();
COMMIT;

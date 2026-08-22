// Migration idempotency guard — re-run/db-reset/preview-branch'te zinciri kiran
// korumasiz DDL'i yakalar. Detay + kurallar: database/lint-migrations.mjs.
//
// Bu test DB baglantisi GEREKTIRMEZ (sadece .sql dosyalarini okur), node env'de
// vitest.database.config.ts ile kosar.
import { describe, it, expect } from 'vitest';
import {
  duplicateMigrationOrdinals,
  lintSql,
  lintAll,
  newViolations,
  unexpectedDuplicateMigrationOrdinals,
} from '../lint-migrations.mjs';

describe('lint-migrations (linter self-check)', () => {
  it('korumasiz DDL ihlal olarak yakalanir', () => {
    const bad = `
      CREATE TABLE foo (id int);
      CREATE INDEX idx_foo ON foo(id);
      CREATE TYPE mood AS ENUM ('a','b');
      CREATE POLICY "p1" ON foo FOR SELECT USING (true);
      CREATE TRIGGER t1 BEFORE INSERT ON foo FOR EACH ROW EXECUTE FUNCTION f();
      CREATE SEQUENCE s1;
    `;
    const rules = new Set(lintSql(bad).map((v) => v.rule));
    expect(rules).toContain('create-table-no-ine');
    expect(rules).toContain('create-index-no-ine');
    expect(rules).toContain('create-type-unguarded');
    expect(rules).toContain('create-policy-no-drop');
    expect(rules).toContain('create-trigger-no-drop');
    expect(rules).toContain('create-sequence-no-ine');
  });

  it('idempotent DDL temiz gecer (false-positive yok)', () => {
    const good = `
      CREATE TABLE IF NOT EXISTS foo (id int);
      CREATE INDEX IF NOT EXISTS idx_foo ON foo(id);
      DO $$ BEGIN
        CREATE TYPE mood AS ENUM ('a','b');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DROP POLICY IF EXISTS "p1" ON foo;
      CREATE POLICY "p1" ON foo FOR SELECT USING (true);
      DROP TRIGGER IF EXISTS t1 ON foo;
      CREATE TRIGGER t1 BEFORE INSERT ON foo FOR EACH ROW EXECUTE FUNCTION f();
      CREATE OR REPLACE FUNCTION g() RETURNS void LANGUAGE sql AS $fn$ SELECT 1 $fn$;
    `;
    expect(lintSql(good)).toEqual([]);
  });

  it('yorum / string / dollar-quoted blok icindeki anahtar kelimeler sayilmaz', () => {
    const tricky = `
      -- CREATE TABLE legacy_foo (id int);
      /* CREATE INDEX idx ON foo(id);
         CREATE POLICY "p" ON foo; */
      INSERT INTO audit (msg) VALUES ('CREATE TYPE injected AS ENUM (x)');
      CREATE OR REPLACE FUNCTION h() RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        -- govde icinde DDL benzeri metin tarama disi
        RAISE NOTICE 'CREATE TABLE x';
      END $$;
    `;
    expect(lintSql(tricky)).toEqual([]);
  });
});

describe('migration repo idempotency', () => {
  it('070_block_and_report temiz (idempotency duzeltme regresyon kilidi)', () => {
    const all = lintAll();
    expect(all['070_block_and_report.sql'] ?? []).toEqual([]);
  });

  it('baseline-disi (yeni) idempotency ihlali yok — her yeni migration idempotent olmali', () => {
    const fresh = newViolations();
    // Hata olursa ihlalleri okunabilir bicimde goster
    expect(fresh, `Yeni idempotency ihlali bulundu:\n${JSON.stringify(fresh, null, 2)}\n\nDuzelt (IF NOT EXISTS / DROP ... IF EXISTS / DO-EXCEPTION) ya da bilerek ise baseline'i guncelle: npm run lint:migrations -- --write-baseline`).toEqual({});
  });

  it('tarihsel 017 disinda yinelenen migration sira numarasi yok', () => {
    expect(unexpectedDuplicateMigrationOrdinals()).toEqual({});
  });
});

describe('migration ordinal guard', () => {
  it('kayitli tarihsel 017 dosya cifti birebir eslestiginde kabul edilir', () => {
    const duplicates = duplicateMigrationOrdinals([
      '017_question_text_search_index.sql',
      '018_next.sql',
      '017_homepage_editor.sql',
    ]);
    expect(unexpectedDuplicateMigrationOrdinals(duplicates)).toEqual({});
  });

  it('yeni ordinal cakismasini ve tarihsel ordinalde ucuncu dosyayi reddeder', () => {
    const duplicates = duplicateMigrationOrdinals([
      '017_homepage_editor.sql',
      '017_question_text_search_index.sql',
      '017_new_collision.sql',
      '139_first.sql',
      '139_second.sql',
    ]);
    expect(unexpectedDuplicateMigrationOrdinals(duplicates)).toEqual({
      '017': [
        '017_homepage_editor.sql',
        '017_new_collision.sql',
        '017_question_text_search_index.sql',
      ],
      '139': ['139_first.sql', '139_second.sql'],
    });
  });
});

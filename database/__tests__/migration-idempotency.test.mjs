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

describe('fonksiyon yeniden olusturma kurallari', () => {
  const rulesOf = (sql) => lintSql(sql).map((v) => v.rule);

  it('OR REPLACE ya da onceden DROP olmadan CREATE FUNCTION re-run sirasinda patlar', () => {
    expect(rulesOf('CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;'))
      .toEqual(['create-function-no-replace']);
    expect(rulesOf('CREATE OR REPLACE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;'))
      .toEqual([]);
  });

  it('DROP + CREATE: REVOKE FROM PUBLIC tek basina yetmez, anon ve authenticated da yazilmali', () => {
    const publicOnly = `
      DROP FUNCTION IF EXISTS public.f(uuid);
      CREATE FUNCTION public.f(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.f(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.f(uuid) TO authenticated;
    `;
    const violations = lintSql(publicOnly);
    expect(violations.map((v) => v.rule)).toEqual(['function-acl-reset']);
    expect(violations[0].detail).toContain('anon');
  });

  it('DROP + CREATE: ayri REVOKE/GRANT ifadelerinin birlesimi rolleri kapsarsa temiz', () => {
    const restated = `
      DROP FUNCTION IF EXISTS public.f(uuid), public.g();
      CREATE FUNCTION public.f(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.f(uuid) FROM PUBLIC;
      REVOKE ALL ON FUNCTION public.f(uuid) FROM anon;
      GRANT EXECUTE ON FUNCTION public.f(uuid) TO authenticated, service_role;
    `;
    expect(lintSql(restated)).toEqual([]);
  });

  it('CREATE oncesinde yazilan yetki sayilmaz; ACL yeniden olusturmada sifirlanir', () => {
    const before = `
      REVOKE ALL ON FUNCTION public.f(uuid) FROM PUBLIC, anon, authenticated;
      DROP FUNCTION public.f(uuid);
      CREATE OR REPLACE FUNCTION public.f(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
    `;
    expect(rulesOf(before)).toEqual(['function-acl-reset']);
  });

  it('baska fonksiyonun yetkisi sayilmaz', () => {
    const other = `
      DROP FUNCTION IF EXISTS public.f();
      CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.f_other() FROM PUBLIC, anon, authenticated;
    `;
    expect(rulesOf(other)).toEqual(['function-acl-reset']);
  });

  it('028/053 search_profiles_admin ACL sifirlamasi baseline kaydinda (090 canli sapmanin kaynagi)', () => {
    const all = lintAll();
    expect(all['028_add_user_stats_to_search_profiles_admin.sql'].map((v) => v.rule)).toContain('function-acl-reset');
    expect(all['053_honeypot_filter_search_rpcs.sql'].filter((v) => v.rule === 'function-acl-reset')).toHaveLength(2);
  });
});

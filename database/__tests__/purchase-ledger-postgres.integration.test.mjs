// Opt-in, disposable PostgreSQL verification for migration 130 (purchase ledger).
// It refuses any database outside the explicit R0.2 test naming convention.
//
// The point of these cases is the data-modifying CTE: the ledger INSERT must run
// in the SAME statement as the debit, so a failed purchase (insufficient balance,
// already owned) leaves NO ledger row, and a successful one always leaves exactly
// one. A static SQL read cannot prove that — only execution can.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const { Client } = pg;
const databaseUrl = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL;
const disposableConfirmation = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE;
if (databaseUrl && disposableConfirmation !== '1') {
  throw new Error('Refusing purchase ledger integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing purchase ledger integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = (filename) => readFileSync(join(__dirname, '..', 'migrations', filename), 'utf8');

// profiles + ownership columns as migrations 057/063/067/068/069 leave them.
const fixtureSql = `
  CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    coin_balance integer NOT NULL DEFAULT 0,
    owned_backgrounds text[] NOT NULL DEFAULT ARRAY['none','gece-mavisi']::text[],
    owned_frames text[] NOT NULL DEFAULT ARRAY['none','mavi']::text[],
    owned_nameplates text[] NOT NULL DEFAULT ARRAY['none']::text[],
    owned_cosmetic_badges text[] NOT NULL DEFAULT ARRAY[]::text[],
    owned_avatar_decorations text[] NOT NULL DEFAULT ARRAY[]::text[]
  );
`;

// (rpc, category, item, ownership column)
const CATEGORIES = [
  ['purchase_background', 'background', 'lofi-kahve', 'owned_backgrounds'],
  ['purchase_frame', 'frame', 'altin-cerceve', 'owned_frames'],
  ['purchase_nameplate', 'nameplate', 'neon-panel', 'owned_nameplates'],
  ['purchase_cosmetic_badge', 'cosmetic_badge', 'yildiz-rozet', 'owned_cosmetic_badges'],
  ['purchase_avatar_decoration', 'avatar_decoration', 'tac', 'owned_avatar_decorations'],
];

async function purchase(client, rpc, userId, itemId, cost) {
  const result = await client.query(
    `SELECT * FROM public.${rpc}($1::uuid, $2::text, $3::integer)`, [userId, itemId, cost],
  );
  return result.rows;
}

async function ledgerRows(client, userId) {
  const result = await client.query(
    `SELECT category, item_id, cost, purchased_at, recorded_at
     FROM public.purchase_ledger WHERE user_id = $1 ORDER BY category`, [userId],
  );
  return result.rows;
}

async function balance(client, userId) {
  const result = await client.query('SELECT coin_balance FROM public.profiles WHERE id = $1', [userId]);
  return Number(result.rows[0].coin_balance);
}

describePostgres('migration 130 purchase ledger on actual PostgreSQL', () => {
  let client;
  let buyer;      // makes real purchases after the migration
  let broke;      // cannot afford anything
  let legacy;     // owned items BEFORE the migration -> backfill path

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);

    buyer = randomUUID(); broke = randomUUID(); legacy = randomUUID();
    await client.query('INSERT INTO public.profiles (id, coin_balance) VALUES ($1, 5000), ($2, 10)', [buyer, broke]);
    // This user already owns things when the migration runs: one real purchase
    // per category plus the defaults, which must NOT be counted as purchases.
    await client.query(`
      INSERT INTO public.profiles (
        id, coin_balance, owned_backgrounds, owned_frames, owned_nameplates,
        owned_cosmetic_badges, owned_avatar_decorations
      ) VALUES (
        $1, 0,
        ARRAY['none','gece-mavisi','gunes-patlamasi'],
        ARRAY['none','mavi','altin'],
        ARRAY['none','pastel'],
        ARRAY['ilk-rozet'],
        ARRAY['kanat']
      )
    `, [legacy]);

    // Migration under test runs AFTER the legacy ownership exists.
    await client.query(migrationSql('130_purchase_ledger.sql'));
  });

  afterAll(async () => { await client?.end(); });

  it('applies the catalog, RLS and ACL contract', async () => {
    const catalog = await client.query(`
      SELECT
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.purchase_ledger'::regclass) AS rls,
        has_table_privilege('authenticated', 'public.purchase_ledger', 'SELECT') AS auth_select,
        has_table_privilege('authenticated', 'public.purchase_ledger', 'INSERT') AS auth_insert,
        has_table_privilege('anon', 'public.purchase_ledger', 'SELECT') AS anon_select,
        (SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'public.purchase_ledger'::regclass
            AND conname = 'purchase_ledger_identity_unique') AS unique_guard
    `);
    expect(catalog.rows[0]).toMatchObject({
      rls: true, auth_select: true, auth_insert: false, anon_select: false, unique_guard: '1',
    });
  });

  it('backfills pre-existing ownership without inventing price or date', async () => {
    const rows = await ledgerRows(client, legacy);
    expect(rows.map((row) => `${row.category}:${row.item_id}`)).toEqual([
      'avatar_decoration:kanat',
      'background:gunes-patlamasi',
      'cosmetic_badge:ilk-rozet',
      'frame:altin',
      'nameplate:pastel',
    ]);
    // Gercek fiyat/tarih hicbir yerde tutulmamisti; uydurulmamali.
    for (const row of rows) {
      expect(row.cost).toBeNull();
      expect(row.purchased_at).toBeNull();
      expect(row.recorded_at).not.toBeNull();
    }
    // Varsayilanlar (none/gece-mavisi/mavi) alim degildir.
    expect(rows).toHaveLength(5);
  });

  it.each(CATEGORIES)('%s records a real purchase in the same statement', async (rpc, category, item) => {
    const before = await balance(client, buyer);
    const rows = await purchase(client, rpc, buyer, item, 300);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].new_balance)).toBe(before - 300);

    const entry = (await ledgerRows(client, buyer)).find((row) => row.category === category);
    expect(entry).toMatchObject({ item_id: item, cost: 300 });
    // Gercek alimda tarih dolu olmali - backfill'den ayirt edilebilsin.
    expect(entry.purchased_at).not.toBeNull();
  });

  it('writes no ledger row when the balance is insufficient', async () => {
    const before = await balance(client, broke);
    const rows = await purchase(client, 'purchase_background', broke, 'pahali-tema', 1200);

    expect(rows).toHaveLength(0); // satin alma gerceklesmedi
    expect(await balance(client, broke)).toBe(before);
    expect(await ledgerRows(client, broke)).toHaveLength(0);
  });

  it('writes no second row and takes no money when the item is already owned', async () => {
    // buyer already bought 'lofi-kahve' in the per-category test above.
    const before = await balance(client, buyer);
    const rowsBefore = await ledgerRows(client, buyer);

    const rows = await purchase(client, 'purchase_background', buyer, 'lofi-kahve', 300);

    expect(rows).toHaveLength(0);
    expect(await balance(client, buyer)).toBe(before);
    expect(await ledgerRows(client, buyer)).toHaveLength(rowsBefore.length);
  });

  it('rejects a negative price before touching anything', async () => {
    const before = await balance(client, buyer);
    await expect(purchase(client, 'purchase_background', buyer, 'negatif', -5))
      .rejects.toThrow(/Gecersiz fiyat/);
    expect(await balance(client, buyer)).toBe(before);
  });

  it('answers the question that motivated the ledger: purchases in a time window', async () => {
    // Bu sorgu migration 130 oncesinde IMKANSIZDI - sahiplik dizisinde tarih yok.
    const result = await client.query(`
      SELECT count(*)::int AS son_bir_saat
      FROM public.purchase_ledger
      WHERE purchased_at >= now() - interval '1 hour'
    `);
    expect(result.rows[0].son_bir_saat).toBe(CATEGORIES.length);
  });
});

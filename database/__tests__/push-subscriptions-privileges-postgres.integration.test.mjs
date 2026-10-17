// Disposable real-PostgreSQL proof for migration 224 (Klipper disc #2606).
// 013 runs under Supabase's default privileges, so the table starts with the
// grants measured on production; without 224's REVOKE every browser-role
// assertion below fails. It never connects unless the caller marks the narrowly
// named database as disposable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SUPABASE_DEFAULT_PRIVILEGES_SQL } from './supabase-default-privileges.mjs'

const databaseUrl = process.env.PUSH_SUBSCRIPTIONS_TEST_DATABASE_URL
if (databaseUrl && process.env.PUSH_SUBSCRIPTIONS_TEST_DATABASE_DISPOSABLE !== '1') {
  throw new Error('Refusing push subscription PostgreSQL test without disposable confirmation')
}
if (databaseUrl && !/^bilge_push_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing push subscription test against a non-disposable database name')
}

const suite = databaseUrl && process.env.PUSH_SUBSCRIPTIONS_TEST_DATABASE_DISPOSABLE === '1'
  ? describe
  : describe.skip
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const createTable = readFileSync(join(migrationsDir, '013_push_subscriptions.sql'), 'utf8')
const migration = readFileSync(join(migrationsDir, '224_push_subscriptions_server_only.sql'), 'utf8')
const { Client } = pg

const fixture = `
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ALTER ROLE service_role BYPASSRLS;

  DROP SCHEMA IF EXISTS auth CASCADE;
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA auth;
  CREATE SCHEMA public;
  GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
  -- Supabase'de uuid-ossp extensions şemasında; 013 nitelendirmeden çağırıyor.
  CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql VOLATILE
    AS $$ SELECT gen_random_uuid() $$;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
`

const TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

async function expectPgError(call, code) {
  try {
    await call()
    throw new Error(`expected PostgreSQL error ${code}`)
  } catch (error) {
    expect(error.code).toBe(code)
  }
}

suite('224 push_subscriptions server-only real PostgreSQL', () => {
  let client
  let privileges
  let grantsBefore
  const owner = randomUUID()
  const other = randomUUID()
  const ownEndpoint = 'https://fcm.googleapis.com/fcm/send/own'
  const otherEndpoint = 'https://updates.push.services.mozilla.com/wpush/v2/other'

  async function tableGrants() {
    const { rows } = await client.query(
      `SELECT role, privilege, has_table_privilege(role, 'public.push_subscriptions', privilege) AS granted
       FROM unnest($1::text[]) AS role, unnest($2::text[]) AS privilege
       ORDER BY role, privilege`,
      [['anon', 'authenticated', 'service_role'], privileges],
    )
    return Object.fromEntries(
      ['anon', 'authenticated', 'service_role'].map((role) => [
        role,
        rows.filter((row) => row.role === role && row.granted).map((row) => row.privilege).sort(),
      ]),
    )
  }

  async function asRole(role, uid, work) {
    await client.query('BEGIN')
    try {
      await client.query(`SET LOCAL ROLE ${role}`)
      await client.query("SELECT set_config('app.uid', $1, true)", [uid ?? ''])
      return await work()
    } finally {
      await client.query('ROLLBACK')
    }
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query(fixture)
    const { rows } = await client.query("SELECT current_setting('server_version_num')::int AS version")
    // MAINTAIN PostgreSQL 17'de geldi; canlı 17.6, CI postgres:16.
    privileges = rows[0].version >= 170000 ? [...TABLE_PRIVILEGES, 'MAINTAIN'] : TABLE_PRIVILEGES

    await client.query('INSERT INTO public.profiles(id) VALUES ($1), ($2)', [owner, other])
    await client.query(SUPABASE_DEFAULT_PRIVILEGES_SQL)
    await client.query(createTable)
    grantsBefore = await tableGrants()
    await client.query(migration)
  })

  afterAll(async () => {
    await client?.end()
  })

  it('starts from the production state: every browser role holds every table privilege', () => {
    const all = [...privileges].sort()
    expect(grantsBefore).toEqual({ anon: all, authenticated: all, service_role: all })
  })

  it('leaves anon and authenticated no table or column privilege, and PUBLIC no entry', async () => {
    const grants = await tableGrants()
    expect(grants.anon).toEqual([])
    expect(grants.authenticated).toEqual([])

    const { rows } = await client.query(`SELECT
      has_any_column_privilege('anon', 'public.push_subscriptions', 'SELECT, INSERT, UPDATE, REFERENCES') AS anon_columns,
      has_any_column_privilege('authenticated', 'public.push_subscriptions', 'SELECT, INSERT, UPDATE, REFERENCES') AS auth_columns,
      (SELECT array_agg(DISTINCT acl.grantee::regrole::text)
         FROM pg_class c, aclexplode(c.relacl) acl
        WHERE c.oid = 'public.push_subscriptions'::regclass) AS grantees,
      current_user AS owner`)
    expect(rows[0].anon_columns).toBe(false)
    expect(rows[0].auth_columns).toBe(false)
    // PUBLIC'e verilmiş bir yetki grantee 0 olarak gelir ve '-' yazılır; listede olmamalı.
    expect([...rows[0].grantees].sort()).toEqual([rows[0].owner, 'service_role'].sort())
  })

  it('refuses a signed-in user even on their own row, including TRUNCATE', async () => {
    await client.query(
      `INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, 'k1', 'a1'), ($3, $4, 'k2', 'a2')`,
      [owner, ownEndpoint, other, otherEndpoint],
    )
    for (const [role, uid] of [['authenticated', owner], ['anon', null]]) {
      for (const statement of [
        'SELECT endpoint FROM public.push_subscriptions',
        `INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth)
           VALUES ('${owner}', 'https://attacker.example/hook', 'k', 'a')`,
        `UPDATE public.push_subscriptions SET endpoint = 'https://attacker.example/hook' WHERE user_id = '${owner}'`,
        `DELETE FROM public.push_subscriptions WHERE user_id = '${owner}'`,
        'TRUNCATE public.push_subscriptions',
      ]) {
        await asRole(role, uid, () => expectPgError(() => client.query(statement), '42501'))
      }
    }
    const { rows } = await client.query('SELECT count(*)::int AS count FROM public.push_subscriptions')
    expect(rows[0].count).toBe(2)
  })

  it('keeps the service-role route and cron flows working, scoped by the user id they pass', async () => {
    await asRole('service_role', null, async () => {
      // /api/push POST: supabase-js upsert(onConflict: 'user_id,endpoint').
      const upsert = `INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, endpoint) DO UPDATE
          SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`
      await client.query(upsert, [owner, ownEndpoint, 'k1-rotated', 'a1-rotated'])
      await client.query(upsert, [owner, 'https://web.push.apple.com/second', 'k3', 'a3'])

      // daily-streak-reminder: user_id IN (...) okuması.
      const read = await client.query(
        `SELECT user_id, endpoint, p256dh FROM public.push_subscriptions
         WHERE user_id = ANY($1::uuid[]) ORDER BY endpoint`,
        [[owner]],
      )
      expect(read.rows).toEqual([
        { user_id: owner, endpoint: ownEndpoint, p256dh: 'k1-rotated' },
        { user_id: owner, endpoint: 'https://web.push.apple.com/second', p256dh: 'k3' },
      ])

      // /api/push DELETE: user_id + endpoint. Başka kullanıcının adresi silinmez.
      const ownDelete = await client.query(
        'DELETE FROM public.push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [owner, otherEndpoint],
      )
      expect(ownDelete.rowCount).toBe(0)
      const realDelete = await client.query(
        'DELETE FROM public.push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [owner, ownEndpoint],
      )
      expect(realDelete.rowCount).toBe(1)

      // Cron temizliği: 410/404 dönen adresler endpoint ile silinir.
      const cleanup = await client.query(
        'DELETE FROM public.push_subscriptions WHERE endpoint = ANY($1::text[])',
        [[otherEndpoint]],
      )
      expect(cleanup.rowCount).toBe(1)
    })
  })

  it('keeps the own-row policy and is idempotent', async () => {
    const before = await client.query(
      "SELECT relacl::text AS acl FROM pg_class WHERE oid = 'public.push_subscriptions'::regclass",
    )
    await client.query(migration)
    const after = await client.query(
      "SELECT relacl::text AS acl FROM pg_class WHERE oid = 'public.push_subscriptions'::regclass",
    )
    expect(after.rows[0].acl).toBe(before.rows[0].acl)

    const policies = await client.query(
      `SELECT policyname, cmd FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'push_subscriptions'`,
    )
    expect(policies.rows).toEqual([{ policyname: 'push_own', cmd: 'ALL' }])
  })
})

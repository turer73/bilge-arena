// Opt-in disposable PostgreSQL coverage for migration 203.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.RETENTION_ERASURE_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.RETENTION_ERASURE_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) {
  throw new Error('non-disposable database refused')
}

const describePg = enabled ? describe : describe.skip
const { Client } = pg
const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '203_retention_erasure_profile_tombstone_safety.sql'),
  'utf8',
)
const requestGateMigration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '204_postgrest_tombstone_request_gate.sql'),
  'utf8',
)

describePg('203 expired-account retention safety preview on real PostgreSQL', () => {
  let client

  beforeAll(async () => {
    client = new Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticator NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER ROLE service_role BYPASSRLS;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role, authenticator;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.profiles(
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
        deleted_at timestamptz
      );
      CREATE TABLE public.institution_operation_events(
        id uuid PRIMARY KEY,
        actor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE public.game_sessions(
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
      );
      CREATE TABLE public.session_answers(
        id uuid PRIMARY KEY,
        session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE NO ACTION
      );
      CREATE TABLE public.verified_attempts(
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
      );
      CREATE TABLE public.question_content_revisions(id uuid PRIMARY KEY);
      CREATE TABLE public.verified_attempt_question_revisions(
        attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
        question_id uuid NOT NULL,
        revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
        PRIMARY KEY(attempt_id, question_id)
      );
      CREATE TABLE public.question_appeals(
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
      );
      CREATE TABLE public.question_result_corrections(
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
      );
    `)

    const unreferenced = randomUUID()
    const auditReferenced = randomUUID()
    const governanceReferenced = randomUUID()
    const practiceReferenced = randomUUID()
    const fresh = randomUUID()
    const active = randomUUID()
    await client.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4),($5),($6)', [
      unreferenced, auditReferenced, governanceReferenced, practiceReferenced, fresh, active,
    ])
    await client.query(
      "INSERT INTO public.profiles(id,deleted_at) VALUES($1,clock_timestamp()-interval '31 days'),($2,clock_timestamp()-interval '31 days'),($3,clock_timestamp()-interval '31 days'),($4,clock_timestamp()-interval '31 days'),($5,clock_timestamp()-interval '29 days')",
      [unreferenced, auditReferenced, governanceReferenced, practiceReferenced, fresh],
    )
    await client.query('INSERT INTO public.profiles(id,deleted_at) VALUES($1,NULL)', [active])
    await client.query('INSERT INTO public.institution_operation_events(id,actor_user_id,payload) VALUES($1,$2,$3)', [
      randomUUID(), auditReferenced, { retention: 'must remain' },
    ])
    const attemptId = randomUUID()
    const revisionId = randomUUID()
    await client.query('INSERT INTO public.verified_attempts(id,user_id) VALUES($1,$2)', [attemptId, governanceReferenced])
    await client.query('INSERT INTO public.question_content_revisions(id) VALUES($1)', [revisionId])
    await client.query('INSERT INTO public.verified_attempt_question_revisions(attempt_id,question_id,revision_id) VALUES($1,$2,$3)', [attemptId, randomUUID(), revisionId])
    await client.query('INSERT INTO public.question_appeals(id,user_id) VALUES($1,$2)', [randomUUID(), governanceReferenced])
    await client.query('INSERT INTO public.question_result_corrections(id,user_id) VALUES($1,$2)', [randomUUID(), governanceReferenced])
    const sessionId = randomUUID()
    await client.query('INSERT INTO public.game_sessions(id,user_id) VALUES($1,$2)', [sessionId, practiceReferenced])
    await client.query('INSERT INTO public.session_answers(id,session_id,user_id) VALUES($1,$2,$3)', [randomUUID(), sessionId, practiceReferenced])

    await client.query(migration)
    await client.query(migration) // Reapplying the migration must remain safe.
    await client.query(requestGateMigration)
    await client.query(requestGateMigration) // The pre-request registration is idempotent.

    client.__retentionFixture = { unreferenced, active }
  })

  afterAll(async () => client?.end())

  async function asRole(role, callback) {
    await client.query(`SET ROLE ${role}`)
    try {
      return await callback()
    } finally {
      await client.query('RESET ROLE')
    }
  }

  it('returns count-only review signals while leaving every profile, child and auth principal intact', async () => {
    const { rows } = await asRole('service_role', () => (
      client.query('SELECT public.preview_expired_account_retention(25) AS preview')
    ))
    const result = rows[0].preview

    expect(result).toMatchObject({
      legacyThresholdDays: 30,
      processed: 4,
      eligibleTombstones: 4,
      authPrincipalsStillPresent: 4,
      governanceBlocked: 1,
      retainedForeignKeyBlocked: 3,
      physicalPurgeEnabled: false,
      legalDecisionRequired: true,
      locked: true,
    })
    expect(Object.values(result).some((value) => typeof value === 'string' && /@|[0-9a-f]{8}-/i.test(value))).toBe(false)

    expect((await client.query('SELECT count(*) FROM public.profiles')).rows[0].count).toBe('6')
    expect((await client.query('SELECT count(*) FROM auth.users')).rows[0].count).toBe('6')
    expect((await client.query('SELECT count(*) FROM public.institution_operation_events')).rows[0].count).toBe('1')
    expect((await client.query('SELECT count(*) FROM public.verified_attempts')).rows[0].count).toBe('1')
    expect((await client.query('SELECT count(*) FROM public.verified_attempt_question_revisions')).rows[0].count).toBe('1')
    expect((await client.query('SELECT count(*) FROM public.question_appeals')).rows[0].count).toBe('1')
    expect((await client.query('SELECT count(*) FROM public.question_result_corrections')).rows[0].count).toBe('1')
    expect((await client.query('SELECT count(*) FROM public.game_sessions')).rows[0].count).toBe('1')
    expect((await client.query('SELECT count(*) FROM public.session_answers')).rows[0].count).toBe('1')
  })

  it('rejects the legacy physical delete before changing any record', async () => {
    await asRole('service_role', async () => {
      await expect(client.query('SELECT public.hard_delete_expired_users()')).rejects.toMatchObject({ code: '55000' })
    })
    expect((await client.query('SELECT count(*) FROM public.profiles')).rows[0].count).toBe('6')
    expect((await client.query('SELECT count(*) FROM auth.users')).rows[0].count).toBe('6')
  })

  it('is service-role-only and has hardened function configuration', async () => {
    const acl = (await client.query(`
      SELECT
        has_function_privilege('anon','public.hard_delete_expired_users()','EXECUTE') AS hard_anon_execute,
        has_function_privilege('authenticated','public.hard_delete_expired_users()','EXECUTE') AS hard_authenticated_execute,
        has_function_privilege('service_role','public.hard_delete_expired_users()','EXECUTE') AS hard_service_execute,
        has_function_privilege('anon','public.preview_expired_account_retention(integer)','EXECUTE') AS preview_anon_execute,
        has_function_privilege('authenticated','public.preview_expired_account_retention(integer)','EXECUTE') AS preview_authenticated_execute,
        has_function_privilege('service_role','public.preview_expired_account_retention(integer)','EXECUTE') AS preview_service_execute,
        count(*) FILTER (WHERE procedure_row.prosecdef AND 'search_path=pg_catalog'=ANY(COALESCE(procedure_row.proconfig,ARRAY[]::text[]))) AS hardened_count
      FROM pg_proc AS procedure_row
      JOIN pg_namespace AS namespace ON namespace.oid=procedure_row.pronamespace
      WHERE namespace.nspname='public'
        AND procedure_row.proname IN ('hard_delete_expired_users','preview_expired_account_retention')
    `)).rows[0]
    expect(acl).toEqual({
      hard_anon_execute: false,
      hard_authenticated_execute: false,
      hard_service_execute: true,
      preview_anon_execute: false,
      preview_authenticated_execute: false,
      preview_service_execute: true,
      hardened_count: '2',
    })
    await asRole('authenticated', async () => {
      await expect(client.query('SELECT public.hard_delete_expired_users()')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('SELECT public.preview_expired_account_retention(25)')).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('rejects an unbounded preview request', async () => {
    await asRole('service_role', async () => {
      await expect(client.query('SELECT public.preview_expired_account_retention(101)')).rejects.toMatchObject({ code: '22023' })
    })
  })

  async function callRequestGate(role, claims, legacyClaims) {
    await client.query('BEGIN')
    try {
      await client.query(`SET LOCAL ROLE ${role}`)
      await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)])
      if (legacyClaims !== undefined) {
        await client.query("SELECT set_config('request.jwt',$1,true)", [JSON.stringify(legacyClaims)])
      }
      const result = await client.query('SELECT public.enforce_active_profile_data_api_request()')
      await client.query('ROLLBACK')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }

  it('allows active authenticated, anonymous and service requests at the Data API pre-request gate', async () => {
    const { active } = client.__retentionFixture
    await expect(callRequestGate('authenticated', { role: 'authenticated', sub: active })).resolves.toBeDefined()
    await expect(callRequestGate('anon', { role: 'anon' })).resolves.toBeDefined()
    await expect(callRequestGate('service_role', { role: 'service_role' })).resolves.toBeDefined()
  })

  it('rejects a tombstoned authenticated JWT before a Data API query can run', async () => {
    const { unreferenced } = client.__retentionFixture
    await expect(callRequestGate('authenticated', {
      role: 'authenticated', sub: unreferenced,
    })).rejects.toMatchObject({ code: 'PGRST' })
  })

  it('never lets a legacy empty claim object shadow canonical authenticated claims', async () => {
    const { unreferenced } = client.__retentionFixture
    await expect(callRequestGate('authenticated', {
      role: 'authenticated', sub: unreferenced,
    }, {})).rejects.toMatchObject({ code: 'PGRST' })
  })

  it('registers the hardened request gate without granting table access', async () => {
    const gate = (await client.query(`
      SELECT
        (SELECT split_part(config,'=',2)
           FROM pg_roles role_row, unnest(COALESCE(role_row.rolconfig,ARRAY[]::text[])) config
          WHERE role_row.rolname='authenticator' AND config LIKE 'pgrst.db_pre_request=%'
          LIMIT 1) AS pre_request,
        has_table_privilege('authenticated','public.profiles','SELECT') AS profile_select,
        has_function_privilege('authenticated','public.enforce_active_profile_data_api_request()','EXECUTE') AS gate_execute
    `)).rows[0]
    expect(gate).toEqual({
      pre_request: 'public.enforce_active_profile_data_api_request',
      profile_select: false,
      gate_execute: true,
    })
  })
})

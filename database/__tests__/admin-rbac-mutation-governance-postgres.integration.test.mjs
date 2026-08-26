import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const dedicated = Boolean(process.env.RBAC_GOVERNANCE_TEST_DATABASE_URL)
const url = process.env.RBAC_GOVERNANCE_TEST_DATABASE_URL
  ?? process.env.CONTENT_GOVERNANCE_TEST_DATABASE_URL
const disposable = dedicated
  ? process.env.RBAC_GOVERNANCE_TEST_DATABASE_DISPOSABLE
  : process.env.CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE
if (url && disposable !== '1') throw new Error('Explicit disposable database flag required')
const allowed = dedicated ? /^bilge_r170_test_[a-z0-9_]+$/i : /^bilge_r43_test_[a-z0-9_]+$/i
if (url && !allowed.test(new URL(url).pathname.slice(1))) {
  throw new Error('Refusing non-disposable RBAC governance database')
}
const suite = url && disposable === '1' ? describe : describe.skip
const rbacMigration = readFileSync(
  new URL('../migrations/170_admin_rbac_mutation_governance.sql', import.meta.url), 'utf8',
)
const routeOnlyMigration = readFileSync(
  new URL('../migrations/171_admin_route_only_dml_lockdown.sql', import.meta.url), 'utf8',
)

suite('170 admin RBAC mutation governance disposable PostgreSQL acceptance', () => {
  let client
  let actor
  let secondManager
  let targetUser
  let managerRole
  let secondManagerRole
  let targetRole

  const rpc = async (name, values) => {
    await client.query("SELECT set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: 'service_role' }),
    ])
    await client.query('SET ROLE service_role')
    try {
      const placeholders = values.map((_, index) => `$${index + 1}`).join(',')
      return (await client.query(`SELECT public.${name}(${placeholders}) AS result`, values)).rows[0].result
    } finally {
      await client.query('RESET ROLE')
    }
  }
  const err = async (work, code) => {
    let caught
    try { await work() } catch (error) { caught = error }
    expect({ code: caught?.code, message: caught?.message }).toEqual(expect.objectContaining({ code }))
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
      $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(COALESCE(
          NULLIF(current_setting('request.jwt.claim.sub',true),''), auth.jwt()->>'sub'
        ),'')::uuid
      $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.roles(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL,
        name text NOT NULL DEFAULT 'fixture', description text,
        is_system boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.role_permissions(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
        permission text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(role_id,permission)
      );
      CREATE TABLE public.user_roles(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
        assigned_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,role_id)
      );
      CREATE TABLE public.admin_logs(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES auth.users(id),
        action text NOT NULL, target_type text NOT NULL, target_id text, details jsonb,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.homepage_sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.homepage_elements(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.site_settings(
        key text PRIMARY KEY, value jsonb, updated_by uuid REFERENCES auth.users(id)
      );
      CREATE TABLE public.error_reports(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id), question_id uuid,
        report_type text NOT NULL, description text, status text,
        admin_note text, resolved_by uuid REFERENCES auth.users(id)
      );
      ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;
      CREATE POLICY error_reports_insert ON public.error_reports FOR INSERT TO authenticated
        WITH CHECK(auth.uid()=user_id);
      CREATE FUNCTION public.has_permission(p_user_id uuid,p_permission text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT EXISTS(
          SELECT 1 FROM public.user_roles assignment
          JOIN public.role_permissions permission ON permission.role_id=assignment.role_id
          WHERE assignment.user_id=p_user_id AND permission.permission=p_permission
        )
      $$;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.roles,public.role_permissions,public.user_roles
        TO authenticated,service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.homepage_sections,public.homepage_elements,
        public.site_settings,public.admin_logs,public.error_reports TO authenticated,service_role;
    `)
    ;[actor, secondManager, targetUser, managerRole, secondManagerRole, targetRole] = Array.from({ length: 6 }, randomUUID)
    await client.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])', [[actor, secondManager, targetUser]])
    await client.query(
      `INSERT INTO public.roles(id,slug,name,is_system) VALUES
       ($1,'manager','Manager',true),($2,'manager_two','Manager Two',false),($3,'target','Target',false)`,
      [managerRole, secondManagerRole, targetRole],
    )
    await client.query(
      `INSERT INTO public.role_permissions(role_id,permission) VALUES
       ($1,'admin.roles.manage'),($2,'admin.roles.manage'),($3,'admin.logs.view')`,
      [managerRole, secondManagerRole, targetRole],
    )
    await client.query(
      `INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2),($3,$4)`,
      [actor, managerRole, secondManager, secondManagerRole],
    )
    await client.query(rbacMigration)
    await client.query(routeOnlyMigration)
  })

  afterAll(async () => { await client?.end() })

  it('closes direct table DML and exposes only the service RPC surface', async () => {
    const grants = (await client.query(`SELECT
      has_table_privilege('authenticated','public.roles','INSERT') AS auth_role_write,
      has_table_privilege('service_role','public.user_roles','DELETE') AS service_assignment_write,
      has_table_privilege('service_role','public.admin_rbac_mutation_requests','SELECT') AS service_ledger_read,
      has_function_privilege('service_role','public.admin_assign_role(uuid,uuid,uuid,uuid)','EXECUTE') AS service_rpc,
      has_function_privilege('authenticated','public.admin_assign_role(uuid,uuid,uuid,uuid)','EXECUTE') AS auth_rpc
    `)).rows[0]
    expect(grants).toEqual({
      auth_role_write: false, service_assignment_write: false, service_ledger_read: false,
      service_rpc: true, auth_rpc: false,
    })
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [
      actor, JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal2' }),
    ])
    await client.query('SET ROLE authenticated')
    try {
      await err(() => client.query(
        'SELECT public.admin_assign_role($1,$2,$3,$4)', [actor, targetUser, targetRole, randomUUID()],
      ), '42501')
      await err(() => client.query(
        "INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2)", [targetUser, targetRole],
      ), '42501')
    } finally {
      await client.query('RESET ROLE')
    }
  })

  it('keeps route-only platform audit/settings boundaries and append-only logs', async () => {
    const grants = (await client.query(`SELECT
      has_table_privilege('authenticated','public.site_settings','UPDATE') AS auth_setting_write,
      has_table_privilege('authenticated','public.admin_logs','INSERT') AS auth_log_write,
      has_table_privilege('service_role','public.site_settings','UPDATE') AS service_setting_write,
      has_table_privilege('service_role','public.admin_logs','INSERT') AS service_log_write,
      has_table_privilege('service_role','public.admin_logs','UPDATE') AS service_log_update
    `)).rows[0]
    expect(grants).toEqual({
      auth_setting_write: false,
      auth_log_write: false,
      service_setting_write: true,
      service_log_write: true,
      service_log_update: false,
    })

    const logId = (await client.query(
      `INSERT INTO public.admin_logs(admin_id,action,target_type,target_id)
       VALUES($1,'fixture','test','route-only') RETURNING id`, [actor],
    )).rows[0].id
    await err(() => client.query(
      "UPDATE public.admin_logs SET action='forged' WHERE id=$1", [logId],
    ), '55000')
  })

  it('creates once, replays once and rejects a reused UUID with another payload', async () => {
    const requestId = randomUUID()
    const payload = { name: 'Auditor', slug: 'auditor', description: null, permissions: ['admin.logs.view'] }
    const first = await rpc('admin_create_role', [actor, requestId, payload])
    expect(first).toEqual(expect.objectContaining({ replayed: false }))
    expect(await rpc('admin_create_role', [actor, requestId, payload]))
      .toEqual(expect.objectContaining({ replayed: true, role: first.role }))
    await err(() => rpc('admin_create_role', [actor, requestId, { ...payload, name: 'Changed' }]), '22023')
    expect(Number((await client.query(
      "SELECT count(*) FROM public.admin_logs WHERE action='create_role' AND target_id=$1",
      [first.role.id],
    )).rows[0].count)).toBe(1)
  })

  it('rolls back the entire permission replacement when its insert fails', async () => {
    await client.query(`ALTER TABLE public.role_permissions
      ADD CONSTRAINT fixture_reject_blocked_permission CHECK(permission <> 'blocked.permission')`)
    try {
      await err(() => rpc('admin_update_role', [
        actor, targetRole, randomUUID(), { permissions: ['blocked.permission'] },
      ]), '23514')
    } finally {
      await client.query('ALTER TABLE public.role_permissions DROP CONSTRAINT fixture_reject_blocked_permission')
    }
    expect((await client.query(
      'SELECT permission FROM public.role_permissions WHERE role_id=$1', [targetRole],
    )).rows).toEqual([{ permission: 'admin.logs.view' }])
    expect(Number((await client.query(
      "SELECT count(*) FROM public.admin_logs WHERE action='update_role' AND target_id=$1", [targetRole],
    )).rows[0].count)).toBe(0)
  })

  it('prevents removal of the last role-manager recovery path', async () => {
    await rpc('admin_update_role', [actor, secondManagerRole, randomUUID(), { permissions: ['admin.logs.view'] }])
    await err(() => rpc('admin_update_role', [
      actor, managerRole, randomUUID(), { permissions: ['admin.logs.view'] },
    ]), '23514')
    expect((await client.query(
      "SELECT permission FROM public.role_permissions WHERE role_id=$1", [managerRole],
    )).rows).toEqual([{ permission: 'admin.roles.manage' }])
  })

  it('assigns, audits, replays and revokes without direct route DML', async () => {
    const assignRequest = randomUUID()
    expect(await rpc('admin_assign_role', [actor, targetUser, targetRole, assignRequest]))
      .toEqual(expect.objectContaining({ success: true, replayed: false }))
    expect(await rpc('admin_assign_role', [actor, targetUser, targetRole, assignRequest]))
      .toEqual(expect.objectContaining({ success: true, replayed: true }))
    await err(() => rpc('admin_assign_role', [actor, targetUser, targetRole, randomUUID()]), '23505')

    const revokeRequest = randomUUID()
    expect(await rpc('admin_revoke_role', [actor, targetUser, targetRole, revokeRequest]))
      .toEqual(expect.objectContaining({ success: true, replayed: false }))
    expect(await rpc('admin_revoke_role', [actor, targetUser, targetRole, revokeRequest]))
      .toEqual(expect.objectContaining({ success: true, replayed: true }))
    expect((await client.query(
      "SELECT action,count(*)::integer AS count FROM public.admin_logs WHERE target_id=$1 AND action IN ('assign_role','remove_role') GROUP BY action ORDER BY action",
      [targetUser],
    )).rows).toEqual([{ action: 'assign_role', count: 1 }, { action: 'remove_role', count: 1 }])
  })

  it('blocks assigned deletion, then deletes and replays after assignment removal', async () => {
    const created = await rpc('admin_create_role', [actor, randomUUID(), {
      name: 'Temporary', slug: 'temporary', description: null, permissions: [],
    }])
    await rpc('admin_assign_role', [actor, targetUser, created.role.id, randomUUID()])
    await err(() => rpc('admin_delete_role', [actor, created.role.id, randomUUID()]), '23514')
    await rpc('admin_revoke_role', [actor, targetUser, created.role.id, randomUUID()])
    const deleteRequest = randomUUID()
    expect(await rpc('admin_delete_role', [actor, created.role.id, deleteRequest]))
      .toEqual(expect.objectContaining({ success: true, replayed: false }))
    expect(await rpc('admin_delete_role', [actor, created.role.id, deleteRequest]))
      .toEqual(expect.objectContaining({ success: true, replayed: true }))
  })

  it('reapplies safely without reopening grants or mutating replay history', async () => {
    const before = Number((await client.query('SELECT count(*) FROM public.admin_rbac_mutation_requests')).rows[0].count)
    await client.query(rbacMigration)
    await client.query(routeOnlyMigration)
    expect(Number((await client.query('SELECT count(*) FROM public.admin_rbac_mutation_requests')).rows[0].count)).toBe(before)
    expect((await client.query(`SELECT
      has_table_privilege('service_role','public.roles','UPDATE') AS direct_write,
      has_function_privilege('service_role','public.admin_update_role(uuid,uuid,uuid,jsonb)','EXECUTE') AS governed_write
    `)).rows[0]).toEqual({ direct_write: false, governed_write: true })
  })
})
